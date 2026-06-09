import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { speak, stopSpeak } from "@/lib/tts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, X, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Voice-driven trip wizard. Jade asks a sequence of pre-established questions.
 * Each step: TTS speaks → STT listens → answer captured → next step.
 *
 * Sequence:
 *   1. "Where are we headed today?"
 *   2. "What are you hauling?"
 *   3. "How heavy is the load, in pounds?"
 *   4. "Is it hazmat?"
 *   5. "When do you want to roll out?"
 *   6. Confirms back and creates the trip via POST /api/trips
 */
const STEPS = [
  { key: "destination", prompt: "Where are we headed today?" },
  { key: "commodity", prompt: "What are you hauling?" },
  { key: "weight_lbs", prompt: "How heavy is the load, in pounds?" },
  { key: "hazmat", prompt: "Is this a hazmat load? Yes or no." },
  { key: "planned_start", prompt: "When do you want to roll out? Say a time or 'now'." },
];

// Lightweight known-city geocoder fallback so the trip can save real lat/lng.
const KNOWN_CITIES = {
  phoenix: { lat: 33.4484, lng: -112.0740, name: "Phoenix, AZ" },
  "phoenix arizona": { lat: 33.4484, lng: -112.0740, name: "Phoenix, AZ" },
  dallas: { lat: 32.7767, lng: -96.7970, name: "Dallas, TX" },
  houston: { lat: 29.7604, lng: -95.3698, name: "Houston, TX" },
  "los angeles": { lat: 34.0522, lng: -118.2437, name: "Los Angeles, CA" },
  la: { lat: 34.0522, lng: -118.2437, name: "Los Angeles, CA" },
  seattle: { lat: 47.6062, lng: -122.3321, name: "Seattle, WA" },
  denver: { lat: 39.7392, lng: -104.9903, name: "Denver, CO" },
  chicago: { lat: 41.8781, lng: -87.6298, name: "Chicago, IL" },
  atlanta: { lat: 33.7490, lng: -84.3880, name: "Atlanta, GA" },
  "el paso": { lat: 31.7619, lng: -106.4850, name: "El Paso, TX" },
  tucson: { lat: 32.2226, lng: -110.9747, name: "Tucson, AZ" },
  miami: { lat: 25.7617, lng: -80.1918, name: "Miami, FL" },
  "new york": { lat: 40.7128, lng: -74.0060, name: "New York, NY" },
  nyc: { lat: 40.7128, lng: -74.0060, name: "New York, NY" },
  portland: { lat: 45.5152, lng: -122.6784, name: "Portland, OR" },
};

function geocode(name) {
  if (!name) return null;
  const k = name.toLowerCase().replace(/[,.]/g, "").trim();
  if (KNOWN_CITIES[k]) return KNOWN_CITIES[k];
  for (const key of Object.keys(KNOWN_CITIES)) {
    if (k.includes(key)) return KNOWN_CITIES[key];
  }
  return null;
}

export default function VoiceTripWizard({ open, onClose, currentLocation, onTripCreated }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const recogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
    setAnswers({});
    setTranscript("");
    setConfirming(false);
    setTimeout(() => speakStep(0), 400);
    return () => {
      stopSpeak();
      recogRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const speakStep = (idx) => {
    const step = STEPS[idx];
    if (!step) return;
    speak(step.prompt, { onEnd: () => startListening(idx) });
  };

  const startListening = (idx) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice not supported — type to advance");
      return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const t = e.results[0][0].transcript.trim();
      setTranscript(t);
      setListening(false);
      capture(idx, t);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    try { r.start(); } catch { /* already running */ }
  };

  const capture = (idx, value) => {
    const step = STEPS[idx];
    let parsed = value;
    if (step.key === "weight_lbs") {
      const n = parseInt(value.replace(/[^0-9]/g, ""), 10);
      parsed = Number.isFinite(n) ? n : 0;
    } else if (step.key === "hazmat") {
      parsed = /yes|yeah|yep|affirm|haz/i.test(value);
    }
    const next = { ...answers, [step.key]: parsed };
    setAnswers(next);
    const nextIdx = idx + 1;
    if (nextIdx >= STEPS.length) {
      confirmAndCreate(next);
    } else {
      setStepIdx(nextIdx);
      setTimeout(() => speakStep(nextIdx), 400);
    }
  };

  const confirmAndCreate = async (final) => {
    setConfirming(true);
    const destGeo = geocode(final.destination) || { lat: 33.4484, lng: -112.0740, name: final.destination || "Unknown destination" };
    const summary = `Got it. Heading to ${destGeo.name}, hauling ${final.commodity || "unspecified"} at ${final.weight_lbs || 0} pounds${final.hazmat ? ", hazmat load" : ""}. Starting ${final.planned_start || "now"}.`;
    speak(summary);
    setCreating(true);
    try {
      const origin = currentLocation
        ? { name: "Current location", lat: Number(currentLocation.lat), lng: Number(currentLocation.lng), kind: "pickup" }
        : { name: "Dallas, TX", lat: 32.7767, lng: -96.797, kind: "pickup" };
      const trip = {
        name: `${origin.name.split(",")[0]} → ${destGeo.name.split(",")[0]} · voice`,
        origin,
        destination: { name: destGeo.name, lat: destGeo.lat, lng: destGeo.lng, kind: "dropoff" },
        stops: [],
        commodity: String(final.commodity || ""),
        weight_lbs: Number(final.weight_lbs) || 0,
        hazmat: !!final.hazmat,
        notes: `Voice-built by Jade. Start: ${final.planned_start || "now"}.`,
      };
      const { data } = await api.post("/trips", trip);
      toast.success("Trip plan saved — Jade is on it");
      onTripCreated?.(data);
      setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save trip");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;
  const step = STEPS[stepIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" data-testid="voice-wizard">
      <Card className="jade-panel jade-tracing-border p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-[Unbounded] text-base">Voice Trip Setup</div>
              <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">
                Step {Math.min(stepIdx + 1, STEPS.length)} of {STEPS.length}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="voice-wizard-close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mt-3">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`h-1.5 flex-1 rounded ${i <= stepIdx ? "bg-primary" : "bg-secondary"}`}
              style={i <= stepIdx ? { boxShadow: "0 0 8px hsl(var(--primary))" } : {}} />
          ))}
        </div>

        {!confirming ? (
          <>
            <div className="mt-5">
              <div className="mono text-[10px] uppercase tracking-widest text-primary mb-1">Jade asks</div>
              <div className="text-xl font-[Unbounded] leading-snug">{step.prompt}</div>
            </div>

            {/* Transcript */}
            <div className="mt-4 min-h-[60px] p-3 rounded-lg bg-secondary/60">
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Your answer</div>
              {transcript ? (
                <div className="text-sm" data-testid="voice-wizard-transcript">{transcript}</div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  {listening ? "Listening…" : "Tap the mic and speak."}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button
                size="lg"
                variant={listening ? "destructive" : "default"}
                className="rounded-full h-14 w-14 p-0"
                onClick={() => listening ? recogRef.current?.stop?.() : startListening(stepIdx)}
                data-testid="voice-wizard-mic"
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button variant="outline" onClick={() => speakStep(stepIdx)} data-testid="voice-wizard-repeat">
                Repeat question
              </Button>
              <Button variant="ghost" onClick={() => capture(stepIdx, "")} data-testid="voice-wizard-skip">Skip</Button>
            </div>
          </>
        ) : (
          <div className="mt-5 text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3 jade-ring-glow rounded-full" />
            <div className="font-[Unbounded] text-lg">Building your trip…</div>
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <div>Destination: <span className="text-foreground">{answers.destination || "—"}</span></div>
              <div>Hauling: <span className="text-foreground">{answers.commodity || "—"}</span></div>
              <div>Weight: <span className="text-foreground">{answers.weight_lbs || 0} lbs</span></div>
              <div>Hazmat: <span className="text-foreground">{answers.hazmat ? "Yes" : "No"}</span></div>
              <div>Start: <span className="text-foreground">{answers.planned_start || "now"}</span></div>
            </div>
            {creating && <div className="mono text-[10px] text-primary mt-3 tracking-widest">SAVING…</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

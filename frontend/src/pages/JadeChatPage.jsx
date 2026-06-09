import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import JadeOrb from "@/components/JadeOrb";
import JadeMap from "@/components/JadeMap";
import VoiceTripWizard from "@/components/VoiceTripWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Send, Volume2, VolumeX, MapPin, Route as RouteIcon } from "lucide-react";
import { toast } from "sonner";

import { speak as ttsSpeak, setMuted as setTtsMuted } from "@/lib/tts";

const SUGGESTIONS = [
  "Where's the nearest truck mechanic?",
  "Find me a hot meal off I-10 in the next 90 mi.",
  "What's the cleanest truck stop ahead?",
  "When should I take my next break?",
  "Are the Phoenix DC delivery hours still open?",
];

export default function JadeChatPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "JADE online. I've got eyes on your route, your HOS clock, and the weather ahead. What do you need, driver?" },
  ]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sessionId] = useState(() => `jade-${Math.random().toString(36).slice(2, 10)}`);
  const [coords, setCoords] = useState(null);
  const [visual, setVisual] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const recogRef = useRef(null);
  const scrollRef = useRef(null);

  // Browser geolocation — falls back to Phoenix demo if unavailable / denied
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords({ lat: 33.4484, lng: -112.0740, source: "fallback" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" }),
      () => setCoords({ lat: 33.4484, lng: -112.0740, source: "fallback" }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const speak = (text) => {
    if (muted) return;
    ttsSpeak(text, {
      voice: "nova",
      model: "tts-1",
      speed: 1.0,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  };

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    try {
      const { data } = await api.post("/jade/chat", {
        session_id: sessionId,
        message: t,
        context: { eta_hr: 11, drive_remaining_hr: 4.6, next_break_min: 87, load_id: "JL-2026-00917" },
        current_location: coords || undefined,
      });
      const reply = data.reply || "(no reply)";
      setMessages((m) => [...m, { role: "assistant", text: reply, visual: data.visual }]);
      if (data.visual) setVisual(data.visual);
      speak(reply);
    } catch (e) {
      toast.error("JADE didn't respond — check connection");
    }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice not supported in this browser. Type instead.");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setListening(false);
      send(transcript);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    r.start();
  };

  const orbState = useMemo(
    () => (speaking ? "speaking" : listening ? "listening" : "idle"),
    [speaking, listening]
  );

  return (
    <div>
      <PageHeader
        title="JADE · Voice Co-pilot"
        subtitle="Claude Sonnet 4.5 + Nova Voice + GPS-aware"
        right={
          <div className="flex items-center gap-2">
            {coords ? (
              <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]" data-testid="jade-coords-badge">
                <MapPin className="w-3 h-3 mr-1" />
                {coords.source === "gps" ? "GPS LOCK" : "DEMO LOC"} · {coords.lat.toFixed(2)}, {coords.lng.toFixed(2)}
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]">
              session · {sessionId}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)} data-testid="open-voice-wizard">
              <RouteIcon className="w-3.5 h-3.5 mr-1" /> Voice trip
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { const next = !muted; setMuted(next); setTtsMuted(next); }} data-testid="jade-mute-btn">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-3">
        <Card className="jade-panel p-6 flex flex-col items-center justify-center min-h-[460px]">
          <JadeOrb state={orbState} size={240} />
          <div className="mt-6 mono text-[11px] tracking-[0.25em] text-muted-foreground uppercase">
            {orbState === "speaking" ? "Jade · Replying" : orbState === "listening" ? "Listening…" : "Idle · Ready"}
          </div>
          <div className="flex items-center gap-2 mt-5">
            <Button
              size="lg"
              variant={listening ? "destructive" : "default"}
              className="rounded-full h-14 w-14 p-0"
              onClick={toggleMic}
              data-testid="jade-mic-btn"
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>
          </div>
          <div className="mt-4 text-[11px] text-muted-foreground text-center max-w-xs leading-relaxed">
            Tap the mic, ask anything about your trip — HOS, parking, weather, ETA. JADE will speak back through your in-cab speakers.
          </div>
        </Card>

        <Card className="jade-panel p-5 flex flex-col min-h-[460px]">
          <div className="font-[Unbounded] text-base mb-3">Conversation</div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="jade-conversation">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary/70 rounded-bl-sm"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 my-3">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="text-[11px] px-3 py-1.5 rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border/60"
                data-testid={`jade-suggest-${i}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ask JADE anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              data-testid="jade-text-input"
            />
            <Button onClick={() => send()} data-testid="jade-send-btn" aria-label="Send message">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        <Card className="jade-panel p-0 flex flex-col min-h-[460px] overflow-hidden jade-tracing-border">
          <JadeMap visual={visual} />
        </Card>
      </div>

      <VoiceTripWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        currentLocation={coords}
        onTripCreated={() => { /* could route to /driver/trip */ }}
      />
    </div>
  );
}

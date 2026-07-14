import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scan, MapPin, User, HeartPulse, Package, Sparkles, ArrowRight, ArrowLeft,
  ShieldCheck, Rocket, Loader2, RefreshCw, CheckCircle2, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import FaceCapture from "@/components/FaceCapture";
import {
  averageDescriptors, currentEAR, snapshotFace, saveEnrollment,
} from "@/lib/faceAuth";
import { speak } from "@/lib/tts";
import ReactMarkdown from "react-markdown";
import JadeMark from "@/components/JadeMark";

const STEPS = [
  { key: "scan", label: "Biometric Enroll", Icon: Scan },
  { key: "profile", label: "Your Basics", Icon: User },
  { key: "attributes", label: "About You", Icon: HeartPulse },
  { key: "load", label: "First Load", Icon: Package },
  { key: "briefing", label: "JADE Briefing", Icon: Sparkles },
];

const EAR_OPEN = 0.27, EAR_CLOSED = 0.21, SAMPLES_NEEDED = 3;

// Simple reverse-geocode via a lightweight public service — fall back gracefully.
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
    const j = await r.json();
    const a = j.address || {};
    const city = a.city || a.town || a.village || a.county || "";
    const state = a.state || "";
    return { city, state, label: [city, state].filter(Boolean).join(", ") };
  } catch {
    return { city: "", state: "", label: "" };
  }
}

export default function OnboardingWizard() {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  // Step 0 — face
  const capRef = useRef(null);
  const [samples, setSamples] = useState([]);
  const [blinkSeen, setBlinkSeen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [scanHint, setScanHint] = useState("Enable the camera to begin biometric enrollment.");
  const earHistoryRef = useRef([]);
  const eyeOpenAfterBlinkRef = useRef(false);

  // Step 1 — basics
  const [basics, setBasics] = useState({
    callsign: "", license: "",
    home_base: "", home_lat: null, home_lng: null,
  });
  const [gps, setGps] = useState({ status: "idle", lat: null, lng: null, label: "" });

  // Step 2 — attributes
  const [attrs, setAttrs] = useState({
    dietary: "", allergies: "", medical_alerts: "",
    family_status: "", faith_notes: "", sleep_hours: 7,
    coffee_habit: "", hobbies: "", safety_notes: "",
  });

  // Step 3 — first load
  const [load, setLoad] = useState({
    origin: "", dest: "", commodity: "", pickup_iso: "", notes: "",
  });

  // Step 4 — briefing
  const [briefing, setBriefing] = useState("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [tripId, setTripId] = useState(null);
  const [voicePlaying, setVoicePlaying] = useState(false);

  // Face-scan poll loop (only when on step 0 and camera ready)
  useEffect(() => {
    if (step !== 0) return;
    let cancelled = false;
    let timer;
    const tick = async () => {
      if (cancelled) return;
      const video = capRef.current?.getVideoEl?.();
      const ready = capRef.current?.isReady?.();
      if (!ready || !video) { timer = setTimeout(tick, 350); return; }
      try {
        const { ear, descriptor } = await currentEAR(video);
        if (ear == null) {
          setScanHint("Center your face in the ring…");
        } else {
          const hist = earHistoryRef.current;
          hist.push(ear); if (hist.length > 12) hist.shift();
          const hadClosed = hist.some((v) => v < EAR_CLOSED);
          const isOpenNow = ear > EAR_OPEN;
          if (!blinkSeen) {
            if (hadClosed && isOpenNow) {
              setBlinkSeen(true);
              eyeOpenAfterBlinkRef.current = true;
              setScanHint("Blink confirmed. Hold still — capturing your face…");
              // capture avatar snapshot immediately after blink
              const shot = snapshotFace(video, 320);
              if (shot && !avatarUrl) setAvatarUrl(shot);
            } else {
              setScanHint("Liveness · blink once now.");
            }
          } else if (eyeOpenAfterBlinkRef.current && descriptor && samples.length < SAMPLES_NEEDED) {
            setSamples((s) => {
              if (s.length >= SAMPLES_NEEDED) return s;
              const next = [...s, descriptor];
              setScanHint(next.length >= SAMPLES_NEEDED
                ? "Face enrolled. Continue when ready."
                : `Captured ${next.length}/${SAMPLES_NEEDED} · turn slightly…`);
              return next;
            });
          }
        }
      } catch { /* keep polling */ }
      timer = setTimeout(tick, 250);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [step, blinkSeen, samples.length, avatarUrl]);

  // Ambient GPS assessment on step 1 mount
  useEffect(() => {
    if (step !== 1) return;
    if (!navigator.geolocation) { setGps({ status: "denied", lat: null, lng: null, label: "" }); return; }
    setGps((g) => ({ ...g, status: "requesting" }));
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const { label } = await reverseGeocode(lat, lng);
      setGps({ status: "ready", lat, lng, label });
      // If home base not set yet, pre-fill from current location
      setBasics((b) => b.home_base ? b : { ...b, home_base: label || `${lat.toFixed(3)}, ${lng.toFixed(3)}`, home_lat: lat, home_lng: lng });
      setLoad((l) => l.origin ? l : { ...l, origin: label || "" });
    }, () => setGps({ status: "denied", lat: null, lng: null, label: "" }), { enableHighAccuracy: true, timeout: 8000 });
  }, [step]);

  // Guard — logged-in users only. Rendered as first hook completes.
  if (authLoading) return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Booting…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const scanReady = samples.length >= SAMPLES_NEEDED && !!avatarUrl;

  const goNext = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const canAdvance = () => {
    if (step === 0) return scanReady;
    if (step === 1) return true; // basics/home optional
    if (step === 2) return true; // attributes optional
    if (step === 3) return load.origin && load.dest;
    return true;
  };

  const submitProfileAndFetchBriefing = async () => {
    // Save descriptor to browser + push profile + trigger briefing
    try {
      const desc = averageDescriptors(samples);
      if (desc) saveEnrollment(user.email, desc, { name: user.name, role: user.role });
    } catch (e) { console.warn("descriptor save failed", e); }

    setBriefingLoading(true);
    window.dispatchEvent(new Event("jade:thinking-start"));
    try {
      // Push profile + first load in one call
      const payload = {
        profile: {
          callsign: basics.callsign,
          license: basics.license,
          home_base: basics.home_base,
          home_lat: basics.home_lat,
          home_lng: basics.home_lng,
          avatar_data_url: avatarUrl,
          ...attrs,
        },
        first_load: (load.origin && load.dest) ? {
          origin: load.origin, dest: load.dest,
          commodity: load.commodity, pickup_iso: load.pickup_iso, notes: load.notes,
          current_lat: gps.lat, current_lng: gps.lng,
        } : undefined,
      };
      const { data } = await api.post("/onboarding/complete", payload);
      setTripId(data.trip_id);

      // Fetch personalized AI briefing
      const { data: b } = await api.post("/jade/trip-briefing", {
        origin: load.origin, destination: load.dest,
        origin_lat: gps.lat, origin_lng: gps.lng,
        commodity: load.commodity, pickup_iso: load.pickup_iso,
      });
      setBriefing(b.briefing || "");
      // Refresh user so avatar shows in shell
      await refreshUser?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save onboarding.");
    } finally {
      setBriefingLoading(false);
      window.dispatchEvent(new Event("jade:thinking-end"));
    }
  };

  const advance = async () => {
    if (step === 3) {
      goNext();
      submitProfileAndFetchBriefing(); // fire-and-forget while user watches loader
      return;
    }
    goNext();
  };

  const finish = () => nav("/driver");

  const speakBriefing = async () => {
    if (voicePlaying) return;
    // Strip markdown for TTS
    const clean = briefing.replace(/[#*_`]/g, "").replace(/\n{2,}/g, ". ").slice(0, 900);
    setVoicePlaying(true);
    try { await speak(clean); } catch { toast.error("Voice playback failed"); }
    setVoicePlaying(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col text-foreground relative overflow-hidden" data-testid="onboarding-wizard">
      {/* animated grid backdrop */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />
        {/* rotating conic beam */}
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: "conic-gradient(from 0deg, transparent, hsl(var(--primary)/0.6), transparent 60%)",
            animation: "spin 22s linear infinite",
          }} />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-10"
          style={{
            background: "conic-gradient(from 180deg, transparent, hsl(var(--primary)/0.8), transparent 60%)",
            animation: "spin 30s linear infinite reverse",
          }} />
      </div>

      {/* Top brand + step indicator */}
      <header className="px-6 lg:px-14 pt-8 pb-4 flex items-center justify-between gap-4">
        <JadeMark size="sm" subtitle="Cockpit Onboarding · Biometric Sequence" />
        <div className="hidden md:flex items-center gap-1">
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.key}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full mono text-[10px] uppercase tracking-widest border transition-all
                  ${done ? "border-primary/30 text-primary/70" :
                    active ? "border-primary text-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]" :
                    "border-border text-muted-foreground/70"}`}
                  data-testid={`step-pill-${s.key}`}>
                  <s.Icon className="w-3 h-3" />
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? "bg-primary/60" : "bg-border"}`} />}
              </React.Fragment>
            );
          })}
        </div>
        <div className="mono text-[10px] tracking-widest text-muted-foreground">Step {step + 1} / {STEPS.length}</div>
      </header>

      {/* Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] px-6 lg:px-14 py-4 lg:py-6 gap-8 lg:gap-14 min-h-0">
        {/* Left — narrative */}
        <div className="flex flex-col justify-center max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={STEPS[step].key + "-copy"}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
            >
              <div className="mono text-[10px] tracking-[0.3em] text-primary mb-3">CHAPTER {step + 1}</div>
              <h1 className="text-4xl lg:text-5xl font-extrabold leading-[1.05] tracking-tight">
                {step === 0 && <>Show us your <span className="text-primary">face</span>.<br/>We&apos;ll remember it.</>}
                {step === 1 && <>Where do you <span className="text-primary">roll</span> from?</>}
                {step === 2 && <>Teach JADE <span className="text-primary">who you are</span>.</>}
                {step === 3 && <>Your first <span className="text-primary">haul</span>.</>}
                {step === 4 && <>Your <span className="text-primary">briefing</span> is ready.</>}
              </h1>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                {step === 0 && "Look into the orb. We'll enroll your face for one-tap login and lift a portrait for your cockpit."}
                {step === 1 && "We just picked up your GPS. Confirm your home base — JADE uses it for return-load planning and family reminders."}
                {step === 2 && "Diet, sleep, faith, family, meds — the more JADE knows, the better the coaching. This lives on the server as your driver memory. Skip anything you'd rather keep private."}
                {step === 3 && "Set your first pickup. JADE will build the plan around it — fuel, halal food if that's you, rest stops matched to your sleep pattern, weather, HOS."}
                {step === 4 && "Personalized to your profile, your load, and this exact origin. Read it, hear JADE speak it, then launch the cockpit."}
              </p>
              <ul className="mt-6 space-y-2 mono text-[11px] text-muted-foreground">
                {step === 0 && <>
                  <li className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Face descriptor stays in this browser · never uploaded.</li>
                  <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" /> Snapshot becomes your in-app portrait.</li>
                </>}
                {step === 1 && <>
                  <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-primary" /> GPS: {gps.status === "ready" ? gps.label || `${gps.lat?.toFixed(3)}, ${gps.lng?.toFixed(3)}` : gps.status === "denied" ? "denied · type manually" : "resolving…"}</li>
                </>}
                {step === 2 && <>
                  <li className="flex items-center gap-2"><HeartPulse className="w-3.5 h-3.5 text-primary" /> Fed into every future JADE response.</li>
                </>}
                {step === 3 && <>
                  <li className="flex items-center gap-2"><Package className="w-3.5 h-3.5 text-primary" /> Creates a live trip you can start from the cockpit.</li>
                </>}
                {step === 4 && <>
                  <li className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" /> Claude Sonnet 4.5 · route + wellbeing + safety.</li>
                </>}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right — interactive step content */}
        <div className="flex flex-col min-h-0">
          <div className="jade-glass rounded-2xl p-6 lg:p-8 flex-1 overflow-auto relative" data-testid={`step-panel-${STEPS[step].key}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={STEPS[step].key + "-panel"}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                {/* STEP 0 — face scan */}
                {step === 0 && (
                  <div className="flex flex-col items-center gap-5">
                    <FaceCapture ref={capRef} testid="onboard-face" size={320} />
                    <div className="w-full max-w-sm">
                      <div className="flex justify-between mono text-[11px] mb-1.5">
                        <span className={blinkSeen ? "text-primary" : "text-muted-foreground"}>1 · Liveness {blinkSeen && "✓"}</span>
                        <span className={samples.length >= SAMPLES_NEEDED ? "text-primary" : "text-muted-foreground"}>2 · Enrolled {samples.length}/{SAMPLES_NEEDED}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (samples.length / SAMPLES_NEEDED) * 100)}%` }} />
                      </div>
                      <p className="text-center text-sm text-muted-foreground mt-3" data-testid="scan-hint">{scanHint}</p>
                      {avatarUrl && (
                        <div className="mt-4 flex items-center gap-3 justify-center" data-testid="avatar-preview">
                          <img src={avatarUrl} alt="portrait" className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/60" />
                          <div className="mono text-[10px] uppercase tracking-widest text-primary">Cockpit portrait ready</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 1 — basics + GPS */}
                {step === 1 && (
                  <div className="space-y-5 max-w-lg mx-auto">
                    <div className="flex items-center gap-3 border border-primary/30 rounded-xl px-4 py-3 bg-primary/5">
                      <MapPin className="w-5 h-5 text-primary" />
                      <div className="flex-1 min-w-0">
                        <div className="mono text-[10px] tracking-widest text-primary uppercase">Current position</div>
                        <div className="text-sm truncate" data-testid="gps-label">
                          {gps.status === "ready" && (gps.label || `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`)}
                          {gps.status === "requesting" && <span className="text-muted-foreground">Resolving GPS…</span>}
                          {gps.status === "denied" && <span className="text-muted-foreground">GPS denied — type your home base manually.</span>}
                          {gps.status === "idle" && "…"}
                        </div>
                      </div>
                      {gps.status === "requesting" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                    </div>
                    <Field label="Home base" hint="City / state or exact address">
                      <Input value={basics.home_base} onChange={(e) => setBasics({ ...basics, home_base: e.target.value })} placeholder="Fort Worth, TX" data-testid="home-base" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Callsign">
                        <Input value={basics.callsign} onChange={(e) => setBasics({ ...basics, callsign: e.target.value })} placeholder="RIG-77" data-testid="callsign" />
                      </Field>
                      <Field label="CDL #">
                        <Input value={basics.license} onChange={(e) => setBasics({ ...basics, license: e.target.value })} placeholder="TX-CDL-4429183" data-testid="cdl" />
                      </Field>
                    </div>
                  </div>
                )}

                {/* STEP 2 — attributes */}
                {step === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                    <Field label="Diet" hint="halal, kosher, vegan, keto, none, etc">
                      <Input value={attrs.dietary} onChange={(e) => setAttrs({ ...attrs, dietary: e.target.value })} placeholder="halal" data-testid="attr-dietary" />
                    </Field>
                    <Field label="Allergies">
                      <Input value={attrs.allergies} onChange={(e) => setAttrs({ ...attrs, allergies: e.target.value })} placeholder="peanuts, latex" data-testid="attr-allergies" />
                    </Field>
                    <Field label="Sleep target (hrs)">
                      <Input type="number" min={4} max={12} step={0.5} value={attrs.sleep_hours} onChange={(e) => setAttrs({ ...attrs, sleep_hours: parseFloat(e.target.value || "7") })} data-testid="attr-sleep" />
                    </Field>
                    <Field label="Coffee habit">
                      <Input value={attrs.coffee_habit} onChange={(e) => setAttrs({ ...attrs, coffee_habit: e.target.value })} placeholder="1 large before 10am" data-testid="attr-coffee" />
                    </Field>
                    <Field label="Family" hint="Home schedule, kids, spouse — JADE uses this for wellbeing nudges">
                      <Input value={attrs.family_status} onChange={(e) => setAttrs({ ...attrs, family_status: e.target.value })} placeholder="home Fri PM, wife + 2 kids" data-testid="attr-family" />
                    </Field>
                    <Field label="Faith / prayer">
                      <Input value={attrs.faith_notes} onChange={(e) => setAttrs({ ...attrs, faith_notes: e.target.value })} placeholder="5x daily prayer, need quiet stops" data-testid="attr-faith" />
                    </Field>
                    <Field label="Medical alerts" full>
                      <Textarea value={attrs.medical_alerts} onChange={(e) => setAttrs({ ...attrs, medical_alerts: e.target.value })} placeholder="diabetes · CPAP · takes lisinopril" rows={2} data-testid="attr-medical" />
                    </Field>
                    <Field label="Safety notes" full hint="Anything JADE should watch for">
                      <Textarea value={attrs.safety_notes} onChange={(e) => setAttrs({ ...attrs, safety_notes: e.target.value })} placeholder="prone to fatigue on long night hauls" rows={2} data-testid="attr-safety" />
                    </Field>
                    <Field label="Hobbies" full hint="For small talk & moral support">
                      <Input value={attrs.hobbies} onChange={(e) => setAttrs({ ...attrs, hobbies: e.target.value })} placeholder="fishing, chess" data-testid="attr-hobbies" />
                    </Field>
                  </div>
                )}

                {/* STEP 3 — first load */}
                {step === 3 && (
                  <div className="space-y-5 max-w-xl mx-auto">
                    <Field label="Origin" hint="Auto-filled from your GPS">
                      <Input value={load.origin} onChange={(e) => setLoad({ ...load, origin: e.target.value })} placeholder="Fort Worth, TX" data-testid="load-origin" />
                    </Field>
                    <Field label="Destination">
                      <Input value={load.dest} onChange={(e) => setLoad({ ...load, dest: e.target.value })} placeholder="Phoenix, AZ" data-testid="load-dest" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Commodity">
                        <Input value={load.commodity} onChange={(e) => setLoad({ ...load, commodity: e.target.value })} placeholder="frozen produce" data-testid="load-commodity" />
                      </Field>
                      <Field label="Pickup">
                        <Input type="datetime-local" value={load.pickup_iso} onChange={(e) => setLoad({ ...load, pickup_iso: e.target.value })} data-testid="load-pickup" />
                      </Field>
                    </div>
                    <Field label="Notes" full>
                      <Textarea value={load.notes} onChange={(e) => setLoad({ ...load, notes: e.target.value })} placeholder="Cold chain · dock 12 · call ahead" rows={2} data-testid="load-notes" />
                    </Field>
                  </div>
                )}

                {/* STEP 4 — briefing */}
                {step === 4 && (
                  <div className="flex flex-col h-full">
                    {briefingLoading ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4 py-12" data-testid="briefing-loading">
                        <div className="relative">
                          <div className="w-24 h-24 rounded-full border-2 border-primary/30 scan-ring" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-8 h-8 text-primary" />
                          </div>
                        </div>
                        <div className="mono text-[11px] tracking-[0.3em] text-primary uppercase">JADE composing your briefing…</div>
                      </div>
                    ) : briefing ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="mono text-[10px] tracking-[0.3em] text-primary uppercase">Personalized briefing</span>
                          <Button size="sm" variant="outline" className="ml-auto" onClick={speakBriefing} disabled={voicePlaying} data-testid="briefing-play-btn">
                            <Volume2 className="w-3.5 h-3.5 mr-1" /> {voicePlaying ? "Playing…" : "Hear JADE"}
                          </Button>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none flex-1 overflow-auto pr-2" data-testid="briefing-text">
                          <ReactMarkdown>{briefing}</ReactMarkdown>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-sm">No briefing yet.</div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between mt-5">
            <Button variant="ghost" onClick={goPrev} disabled={step === 0 || briefingLoading} data-testid="onboard-back-btn">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="flex items-center gap-3">
              {step > 0 && step < 3 && (
                <button onClick={() => nav("/driver")} className="mono text-[10px] tracking-widest text-muted-foreground hover:text-foreground uppercase" data-testid="onboard-skip">
                  Skip onboarding
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <Button onClick={advance} disabled={!canAdvance()} className="btn-lime hover:btn-lime h-11 px-6" data-testid="onboard-next-btn">
                  {step === 3 ? <><Sparkles className="w-4 h-4 mr-2" /> Generate briefing</> : <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>}
                </Button>
              ) : (
                <Button onClick={finish} className="btn-lime hover:btn-lime h-11 px-6" data-testid="onboard-launch-btn" disabled={briefingLoading}>
                  <Rocket className="w-4 h-4 mr-2" /> Launch cockpit
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, hint, full, children }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground flex items-center gap-2">
        {label} {hint && <span className="text-muted-foreground/60 normal-case tracking-normal">· {hint}</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

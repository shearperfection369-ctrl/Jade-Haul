import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, X, Send, CloudLightning, Radio, AlertTriangle, Info, Volume2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { speak, stopSpeak } from "@/lib/tts";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

// How long the driver must be idle before JADE offers a small-talk opener.
const AMBIENT_IDLE_MS = 5 * 60 * 1000;
const ALERT_POLL_MS = 25 * 1000;

// Web Speech API — SpeechRecognition is browser-native.
function getRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SR ? new SR() : null;
}

const SEV_STYLE = {
  info: { border: "border-primary/50", glow: "shadow-[0_0_40px_hsl(var(--primary)/0.3)]", icon: Info, label: "INFO" },
  warning: { border: "border-yellow-400/60", glow: "shadow-[0_0_50px_rgba(250,204,21,0.35)]", icon: CloudLightning, label: "WARNING" },
  critical: { border: "border-destructive/70", glow: "shadow-[0_0_60px_hsl(var(--destructive)/0.45)]", icon: AlertTriangle, label: "CRITICAL" },
};

const KIND_ICON = {
  weather: CloudLightning,
  traffic: AlertTriangle,
  route: Radio,
  hos: Info,
  dispatch: Radio,
};

/**
 * Global JADE companion. Mount once inside AppShell (for drivers only).
 * Provides:
 *  - Push-to-talk conversation (WebSpeech STT → /api/jade/converse → TTS)
 *  - Ambient small-talk after AMBIENT_IDLE_MS of silence
 *  - Alert popups polled from /api/driver/alerts with voice + acknowledge
 */
export default function JadeCompanion() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState("");
  const [transcript, setTranscript] = useState([]); // [{role, text}]
  const [alert, setAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const recogRef = useRef(null);
  const sessionIdRef = useRef(`companion-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const lastActRef = useRef(Date.now());
  const seenAlertIds = useRef(new Set());
  const speakingRef = useRef(false);
  const bottomRef = useRef(null);
  const mutedRef = useRef(false);

  // Autoscroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript, thinking]);

  // Ambient prompt scheduler — checks every 30s if driver has been idle long enough.
  useEffect(() => {
    if (user?.role !== "driver") return;
    const id = setInterval(async () => {
      const idle = Date.now() - lastActRef.current;
      if (idle < AMBIENT_IDLE_MS) return;
      if (thinking || speakingRef.current || alert) return;
      // Reset last-act so we don't fire again immediately.
      lastActRef.current = Date.now();
      window.dispatchEvent(new Event("jade:thinking-start"));
      try {
        const { data } = await api.post("/jade/ambient", {
          minutes_idle: Math.floor(idle / 60000),
          hobbies_hint: user?.hobbies || "",
        });
        if (!data.prompt) return;
        setTranscript((t) => [...t, { role: "assistant", text: data.prompt, ambient: true }]);
        setOpen(true);
        await speakSafely(data.prompt);
      } catch (e) { /* silent */ }
      finally { window.dispatchEvent(new Event("jade:thinking-end")); }
    }, 30000);
    return () => clearInterval(id);
  }, [user, thinking, alert]);

  // Alert poller.
  useEffect(() => {
    if (user?.role !== "driver") return;
    let alive = true;
    const poll = async () => {
      try {
        const { data } = await api.get("/driver/alerts?unack_only=true&limit=5");
        const fresh = data.filter((a) => !seenAlertIds.current.has(a.id));
        if (fresh.length) {
          fresh.forEach((a) => seenAlertIds.current.add(a.id));
          setAlertQueue((q) => [...q, ...fresh]);
        }
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, ALERT_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [user]);

  // Drain queue → surface next alert. Enforce a 6-second cooldown between
  // popups so acking one doesn't immediately fire another (was the "popup
  // never goes away" bug).
  const cooldownRef = useRef(0);
  useEffect(() => {
    if (alert || alertQueue.length === 0) return;
    const wait = Math.max(0, cooldownRef.current - Date.now());
    const timer = setTimeout(() => {
      // Re-check under the timeout — user may have opened another popup meanwhile.
      setAlertQueue((q) => {
        if (!q.length) return q;
        const [next, ...rest] = q;
        setAlert(next);
        (async () => {
          try { await speakSafely(`${next.title}. ${next.body}`); } catch { /* silent */ }
        })();
        return rest;
      });
    }, wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert, alertQueue.length]);

  // Register user activity — throttled via events on window.
  useEffect(() => {
    const bump = () => { lastActRef.current = Date.now(); };
    window.addEventListener("mousemove", bump, { passive: true });
    window.addEventListener("keydown", bump);
    window.addEventListener("touchstart", bump, { passive: true });
    return () => {
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("touchstart", bump);
    };
  }, []);

  const speakSafely = async (t) => {
    if (mutedRef.current || !t) return;
    speakingRef.current = true;
    try { await speak(t); } finally { speakingRef.current = false; }
  };

  const send = useCallback(async (utterance) => {
    const msg = (utterance ?? text).trim();
    if (!msg || thinking) return;
    setText("");
    setTranscript((t) => [...t, { role: "user", text: msg }]);
    setThinking(true);
    window.dispatchEvent(new Event("jade:thinking-start"));
    lastActRef.current = Date.now();
    try {
      // Best-effort geolocation
      const loc = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { timeout: 3000 },
        );
      });
      const { data } = await api.post("/jade/converse", {
        session_id: sessionIdRef.current,
        message: msg,
        current_location: loc || undefined,
      });
      setTranscript((t) => [...t, { role: "assistant", text: data.reply }]);
      await speakSafely(data.reply);
    } catch (e) {
      setTranscript((t) => [...t, { role: "assistant", text: "I lost the link for a moment — try again." }]);
    } finally {
      setThinking(false);
      window.dispatchEvent(new Event("jade:thinking-end"));
    }
  }, [text, thinking]);

  const startListening = () => {
    stopSpeak();
    const rec = getRecognition();
    if (!rec) return toast.error("This browser has no speech recognition. Type instead.");
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const t = ev.results[0]?.[0]?.transcript;
      if (t) send(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const stopListening = () => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  };

  const ackAlert = async () => {
    if (!alert) return;
    try { await api.patch(`/driver/alerts/${alert.id}/ack`); } catch { /* silent */ }
    cooldownRef.current = Date.now() + 6000;   // 6-second cooldown before next popup
    setAlert(null);
    stopSpeak();
    speakingRef.current = false;
  };

  // Local dismiss — closes the popup without server ack. Server will still
  // return the alert as unack'd on next poll, but seenAlertIds ensures it
  // won't re-pop; user can revisit via a future Alerts page.
  const dismissAlert = () => {
    if (!alert) return;
    cooldownRef.current = Date.now() + 6000;
    setAlert(null);
    stopSpeak();
    speakingRef.current = false;
  };

  // ESC to dismiss popup.
  useEffect(() => {
    if (!alert) return;
    const onKey = (e) => { if (e.key === "Escape") dismissAlert(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);

  const openWithGreeting = async () => {
    setOpen(true);
    if (transcript.length === 0) {
      const first = (user?.name || "Driver").split(" ")[0];
      const greet = `Hey ${first}, I'm right here. What's on your mind?`;
      setTranscript([{ role: "assistant", text: greet }]);
      await speakSafely(greet);
    }
  };

  if (user?.role !== "driver") return null;

  return (
    <>
      {/* Floating orb */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="orb"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.35 }}
            onClick={openWithGreeting}
            className="fixed z-40 bottom-6 right-6 w-16 h-16 rounded-full flex items-center justify-center border border-primary/50 bg-card/70 backdrop-blur shadow-[0_0_30px_hsl(var(--primary)/0.35)] hover:shadow-[0_0_50px_hsl(var(--primary)/0.6)] transition-shadow"
            data-testid="jade-companion-orb"
          >
            <div className="absolute inset-0 rounded-full scan-ring border border-primary/30" />
            <Sparkles className="w-6 h-6 text-primary" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Voice / chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="fixed z-40 bottom-6 right-6 w-[380px] max-w-[92vw] jade-glass rounded-2xl border border-primary/25 flex flex-col overflow-hidden"
            style={{ height: "min(72vh, 640px)" }}
            data-testid="jade-companion-panel"
          >
            <div className="px-4 py-3 flex items-center gap-2 border-b border-border/40">
              <div className="relative w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full scan-ring border border-primary/40" />
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-none">JADE · Copilot</div>
                <div className="mono text-[10px] tracking-widest text-primary uppercase">
                  {listening ? "Listening…" : thinking ? "Thinking…" : "Real-time · Claude 4.5"}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} data-testid="jade-companion-close"><X className="w-4 h-4" /></Button>
            </div>

            <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
              {transcript.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Tap the mic and just talk — or type below. I stay with you until this load is delivered.
                </div>
              )}
              {transcript.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`convo-msg-${m.role}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary/90 text-primary-foreground"
                      : "bg-card/80 border border-border/60"
                  }`}>
                    {m.ambient && <span className="mono text-[9px] tracking-widest text-primary uppercase mb-1 block">Ambient</span>}
                    {m.text}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-card/80 border border-border/60 rounded-2xl px-3 py-2 flex gap-1" data-testid="convo-thinking">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="border-t border-border/40 p-3 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition-all ${
                  listening
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                }`}
                data-testid="companion-mic-btn"
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={listening ? "Listening…" : "Say hi or type…"}
                disabled={thinking}
                data-testid="companion-input"
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={!text.trim() || thinking} data-testid="companion-send-btn"><Send className="w-4 h-4" /></Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert popup */}
      <AnimatePresence>
        {alert && (
          <AlertPopup
            alert={alert}
            queueLen={alertQueue.length}
            onAck={ackAlert}
            onDismiss={dismissAlert}
            onReplay={() => speakSafely(`${alert.title}. ${alert.body}`)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AlertPopup({ alert, queueLen, onAck, onDismiss, onReplay }) {
  const style = SEV_STYLE[alert.severity] || SEV_STYLE.info;
  const KindIcon = KIND_ICON[alert.kind] || Radio;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      data-testid="jade-alert-popup"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 10 }}
        transition={{ type: "spring", damping: 22, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-[520px] max-w-[92vw] jade-glass rounded-2xl border-2 ${style.border} ${style.glow} p-6 overflow-hidden`}
      >
        {/* Explicit close X — dismisses without server ack, respects cooldown. */}
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center hover:bg-card/60 z-10"
          data-testid="alert-close-btn"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
        {queueLen > 0 && (
          <div className="absolute top-3 left-3 mono text-[9px] tracking-widest uppercase text-muted-foreground z-10">
            +{queueLen} queued
          </div>
        )}
        {/* rotating beam */}
        <div
          className="absolute -top-20 -right-20 w-64 h-64 opacity-20 pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${alert.severity === "critical" ? "hsl(var(--destructive))" : alert.severity === "warning" ? "#facc15" : "hsl(var(--primary))"}, transparent 60%)`,
            animation: "spin 8s linear infinite",
            borderRadius: "9999px",
          }}
        />
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${style.border} bg-background/40`}>
            <style.icon className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">{alert.kind}</span>
              <span className={`mono text-[10px] tracking-[0.3em] uppercase px-2 py-0.5 rounded border ${style.border}`}>{style.label}</span>
            </div>
            <h3 className="text-2xl font-extrabold leading-tight" data-testid="alert-title">{alert.title}</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed" data-testid="alert-body">{alert.body}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={onReplay} data-testid="alert-replay-btn">
                <Volume2 className="w-3.5 h-3.5 mr-1" /> Replay
              </Button>
              <Button size="sm" onClick={onAck} className="btn-lime hover:btn-lime" data-testid="alert-ack-btn">
                <KindIcon className="w-3.5 h-3.5 mr-1" /> Acknowledge
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

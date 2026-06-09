import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import JadeOrb from "@/components/JadeOrb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { speak as ttsSpeak, setMuted as setTtsMuted } from "@/lib/tts";

const JADE_INTRO = "https://customer-assets.emergentagent.com/job_broker-copilot-2/artifacts/ncrcc3sk_01-jade-vigor-code.mp3";

const SUGGESTIONS = [
  "When should I take my next break?",
  "Where's the cleanest truck stop ahead?",
  "Read me my current load status.",
  "Am I going to make the delivery on time?",
  "Find me a hot meal off I-10 in the next 90 mi.",
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
  const recogRef = useRef(null);
  const scrollRef = useRef(null);

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
      });
      const reply = data.reply || "(no reply)";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
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

  const playIntro = () => {
    try {
      new Audio(JADE_INTRO).play();
    } catch {
      /* audio unavailable */
    }
  };

  const orbState = useMemo(
    () => (speaking ? "speaking" : listening ? "listening" : "idle"),
    [speaking, listening]
  );

  return (
    <div>
      <PageHeader
        title="JADE · Voice Co-pilot"
        subtitle="Claude Sonnet 4.5 + Browser Voice"
        right={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]">
              session · {sessionId}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => { const next = !muted; setMuted(next); setTtsMuted(next); }} data-testid="jade-mute-btn">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3">
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
            <Button variant="outline" onClick={playIntro} data-testid="jade-intro-btn">Play JADE signature</Button>
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
      </div>
    </div>
  );
}

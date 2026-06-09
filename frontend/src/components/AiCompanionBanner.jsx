import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { speak, setMuted, isMuted } from "@/lib/tts";
import {
  Sparkles, Volume2, VolumeX, Clock, Fuel, MapPin,
  Wind, Thermometer, Truck, Coffee, Shield
} from "lucide-react";

const ICONS = { Clock, Fuel, MapPin, Wind, Thermometer, Truck, Coffee, Shield };

/**
 * Floating "always-on" JADE companion banner.
 * - Cycles a fresh proactive tip every 45s
 * - Speaks the tip aloud (Nova voice) unless muted
 * - Driver can mute / fetch next / dismiss
 */
export default function AiCompanionBanner() {
  const [tip, setTip] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const [hidden, setHidden] = useState(false);

  const fetchTip = async (announce = true) => {
    try {
      const { data } = await api.get("/companion/tip");
      setTip(data);
      if (announce && !muted) speak(data.text);
    } catch { /* noop */ }
  };

  useEffect(() => {
    fetchTip(true);
    const id = setInterval(() => fetchTip(true), 45_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden || !tip) return null;
  const Icon = ICONS[tip.icon] || Sparkles;

  return (
    <Card className="jade-panel p-3 flex items-center gap-3 mb-4 jade-tracing-border" data-testid="ai-companion-banner">
      <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">JADE · on the road with you</div>
        <div className="text-sm leading-snug">{tip.text}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { const next = !muted; setMuted(next); setMutedState(next); }}
        data-testid="companion-mute"
        title={muted ? "Unmute Jade" : "Mute Jade"}
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </Button>
      <Button variant="outline" size="sm" onClick={() => fetchTip(true)} data-testid="companion-next">Next</Button>
      <Button variant="ghost" size="sm" onClick={() => setHidden(true)} data-testid="companion-dismiss">×</Button>
    </Card>
  );
}

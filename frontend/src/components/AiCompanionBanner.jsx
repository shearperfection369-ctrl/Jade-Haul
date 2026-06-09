import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { speak, setMuted, isMuted } from "@/lib/tts";
import {
  Sparkles, Volume2, VolumeX, Play, Clock, Fuel, MapPin,
  Wind, Thermometer, Truck, Coffee, Shield
} from "lucide-react";

const ICONS = { Clock, Fuel, MapPin, Wind, Thermometer, Truck, Coffee, Shield };

/**
 * Companion banner — rotates silently every 2 minutes.  Audio is opt-in via the
 * Play button to avoid the constant TTS download/decode chain that previously
 * locked up the audio system every 45 seconds.
 */
function AiCompanionBanner() {
  const [tip, setTip] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const [hidden, setHidden] = useState(false);

  const fetchTip = async () => {
    try {
      const { data } = await api.get("/companion/tip");
      setTip(data);
    } catch (e) {
      console.warn("companion tip failed:", e?.message || e);
    }
  };

  useEffect(() => {
    fetchTip();
    const id = setInterval(fetchTip, 120_000); // 2 min — silent rotate
    return () => clearInterval(id);
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
        onClick={() => speak(tip.text)}
        title="Hear it"
        data-testid="companion-play"
        disabled={muted}
      >
        <Play className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { const next = !muted; setMuted(next); setMutedState(next); }}
        data-testid="companion-mute"
        title={muted ? "Unmute Jade" : "Mute Jade"}
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </Button>
      <Button variant="outline" size="sm" onClick={fetchTip} data-testid="companion-next">Next</Button>
      <Button variant="ghost" size="sm" onClick={() => setHidden(true)} data-testid="companion-dismiss">×</Button>
    </Card>
  );
}

export default React.memo(AiCompanionBanner);

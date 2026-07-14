import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Rocket, StopCircle, MapPin, Gauge } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Floating simulation HUD that surfaces when the caller has an active
 * simulation running. Polls every 4s.
 */
export default function SimulationHUD() {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer;
    const poll = async () => {
      if (!alive) return;
      try {
        const { data } = await api.get("/simulation/status");
        if (data && (data.active || data.status === "delivered")) {
          setState(data);
          setVisible(true);
        } else {
          setVisible(false);
        }
      } catch { /* silent */ }
      timer = setTimeout(poll, 4000);
    };
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const stop = async () => {
    try { await api.post("/simulation/stop"); setVisible(false); } catch { /* silent */ }
  };

  if (!visible || !state) return null;
  const pct = Math.round((state.progress || 0) * 100);
  const done = state.status === "delivered";

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed z-[65] top-4 left-1/2 -translate-x-1/2 jade-glass rounded-full px-4 py-2 border border-primary/50 shadow-[0_0_30px_hsl(var(--primary)/0.35)] flex items-center gap-3"
      data-testid="simulation-hud"
    >
      <div className="relative w-6 h-6 flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full border border-primary/60 ${done ? "" : "scan-ring"}`} />
        <Rocket className="w-3 h-3 text-primary" />
      </div>
      <div className="mono text-[10px] tracking-[0.3em] uppercase text-primary">
        {done ? "DELIVERED" : "SIM · RUNNING"}
      </div>
      <div className="hidden md:flex items-center gap-2 text-[11px]">
        <MapPin className="w-3 h-3 text-muted-foreground" />
        <span className="truncate max-w-[180px]">{state.city}, {state.state}</span>
        <span className="text-muted-foreground">·</span>
        <Gauge className="w-3 h-3 text-muted-foreground" />
        <span>{Math.round(state.miles)} / {state.total_mi} mi ({pct}%)</span>
      </div>
      <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%`, boxShadow: "0 0 8px hsl(var(--primary))" }} />
      </div>
      {!done && (
        <button onClick={stop} className="mono text-[9px] tracking-widest uppercase text-muted-foreground hover:text-destructive flex items-center gap-1" data-testid="sim-stop-btn">
          <StopCircle className="w-3 h-3" /> Stop
        </button>
      )}
    </motion.div>
  );
}

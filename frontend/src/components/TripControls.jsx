import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Loader2, Timer, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Trip lifecycle controls for a scanned/active shipment.
 * Props:
 *  - shipment: shipment object (must contain id, trip_status, trip_started_at, trip_resumed_at, trip_active_seconds)
 *  - onChange: (updatedShipment) => void  (called after every mutation)
 *  - compact: boolean — smaller footprint for embedding in cards
 */
export default function TripControls({ shipment, onChange, compact = false }) {
  const [busy, setBusy] = useState(null); // 'start' | 'pause' | 'resume' | 'end' | null
  const [tick, setTick] = useState(0);

  // Re-render every second while RUNNING so the timer updates.
  useEffect(() => {
    if (shipment?.trip_status !== "RUNNING") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [shipment?.trip_status]);

  if (!shipment?.id) return null;

  const call = async (path, action) => {
    setBusy(action);
    try {
      const { data } = await api.post(path, { shipment_id: shipment.id });
      onChange?.(data);
      const msgMap = {
        start: "Trip started — safe travels",
        pause: "Trip paused",
        resume: "Trip resumed",
        end: "Trip completed — nice work",
      };
      toast.success(msgMap[action] || "OK");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  // Live active-time display
  const liveSeconds = (() => {
    const base = shipment.trip_active_seconds || 0;
    if (shipment.trip_status !== "RUNNING") return base;
    const anchor = shipment.trip_resumed_at || shipment.trip_started_at;
    if (!anchor) return base;
    const delta = Math.max(0, Math.floor((Date.now() - new Date(anchor).getTime()) / 1000));
    return base + delta;
  })();

  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const status = shipment.trip_status || "NOT_STARTED";
  const statusMeta = {
    NOT_STARTED: { label: "Ready to Roll", color: "text-muted-foreground border-border" },
    RUNNING: { label: "Trip Running", color: "text-primary border-primary/50 animate-pulse" },
    PAUSED: { label: "Paused", color: "text-amber-400 border-amber-500/50" },
    ENDED: { label: "Delivered", color: "text-emerald-400 border-emerald-500/50" },
  }[status];

  return (
    <div
      className={`jade-glass rounded-xl border border-primary/30 ${compact ? "p-3" : "p-4"} space-y-3`}
      data-testid="trip-controls"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-primary" />
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Trip Timer</div>
        </div>
        <Badge variant="outline" className={statusMeta.color}>{statusMeta.label}</Badge>
      </div>

      <div className="font-[Unbounded] text-3xl mono tabular-nums text-primary" data-testid="trip-timer">
        {fmt(liveSeconds)}
      </div>

      {status === "NOT_STARTED" && (
        <div className="text-xs text-muted-foreground leading-relaxed">
          BOL locked in. When you&apos;re ready to roll, tap <span className="text-primary font-medium">Start Trip</span> — JADE will track
          drive-time, HOS clock, and ETA against your BOL windows.
        </div>
      )}
      {status === "PAUSED" && (
        <div className="text-xs text-amber-400/80 leading-relaxed">
          Trip paused. Timer frozen. Tap <span className="font-medium">Resume</span> when you&apos;re moving again.
        </div>
      )}
      {status === "ENDED" && (
        <div className="text-xs text-emerald-400/80 leading-relaxed flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Trip complete. Total active time above.
        </div>
      )}

      <div className="flex gap-2">
        {status === "NOT_STARTED" && (
          <Button
            className="flex-1"
            size={compact ? "sm" : "default"}
            onClick={() => call("/shipments/trip/start", "start")}
            disabled={busy !== null}
            data-testid="trip-start-btn"
          >
            {busy === "start" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Start Trip
          </Button>
        )}
        {status === "RUNNING" && (
          <>
            <Button
              className="flex-1"
              variant="secondary"
              size={compact ? "sm" : "default"}
              onClick={() => call("/shipments/trip/pause", "pause")}
              disabled={busy !== null}
              data-testid="trip-pause-btn"
            >
              {busy === "pause" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
              Pause
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={() => call("/shipments/trip/end", "end")}
              disabled={busy !== null}
              data-testid="trip-end-btn"
            >
              {busy === "end" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Square className="w-4 h-4 mr-2" />}
              End Trip
            </Button>
          </>
        )}
        {status === "PAUSED" && (
          <>
            <Button
              className="flex-1"
              size={compact ? "sm" : "default"}
              onClick={() => call("/shipments/trip/resume", "resume")}
              disabled={busy !== null}
              data-testid="trip-resume-btn"
            >
              {busy === "resume" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Resume
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={() => call("/shipments/trip/end", "end")}
              disabled={busy !== null}
              data-testid="trip-end-btn"
            >
              <Square className="w-4 h-4 mr-2" /> End Trip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

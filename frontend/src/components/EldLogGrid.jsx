import React from "react";

const STATUSES = ["OFF_DUTY", "SLEEPER", "DRIVING", "ON_DUTY"];
const LABELS = { OFF_DUTY: "OFF", SLEEPER: "SB", DRIVING: "DRV", ON_DUTY: "ON" };

/** Classic 4-row 24h ELD log grid driven by event timestamps. */
export default function EldLogGrid({ events = [] }) {
  const W = 100; // percent
  const startHr = 0;

  // Build per-status horizontal bars
  // Convert events into ordered timeline of (hourFraction, status) anchored on 24h.
  const normalized = events.map((e) => {
    const d = new Date(e.t);
    const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
    return { hr, status: e.status };
  });
  // ensure 0h start
  if (!normalized.length || normalized[0].hr > 0) {
    normalized.unshift({ hr: 0, status: normalized[0]?.status || "OFF_DUTY" });
  }
  normalized.push({ hr: 24, status: normalized[normalized.length - 1].status });

  // Build segments per row
  const segments = STATUSES.map((s) => {
    const rows = [];
    for (let i = 0; i < normalized.length - 1; i++) {
      if (normalized[i].status === s) {
        rows.push([normalized[i].hr, normalized[i + 1].hr]);
      }
    }
    return { status: s, rows };
  });

  return (
    <div className="jade-panel p-4" data-testid="eld-log-grid">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-[Unbounded] text-base">24-Hour Log</div>
          <div className="mono text-[10px] text-muted-foreground">FMCSA ELD · auto-recorded</div>
        </div>
        <div className="flex gap-3 text-[10px] mono text-muted-foreground">
          {STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" /> {LABELS[s]}
            </div>
          ))}
        </div>
      </div>

      {/* Hour scale */}
      <div className="flex mono text-[10px] text-muted-foreground pl-12 pr-2 mb-1">
        {Array.from({ length: 25 }).map((_, h) => (
          <div key={h} className="flex-1 text-center" style={{ flex: h === 24 ? 0 : 1 }}>
            {h % 3 === 0 ? h.toString().padStart(2, "0") : ""}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {segments.map(({ status, rows }) => (
          <div key={status} className="flex items-center gap-2">
            <div className="mono text-[10px] text-muted-foreground w-10 shrink-0">{LABELS[status]}</div>
            <div className="relative flex-1 h-7 bg-secondary/60 rounded border border-border/70 overflow-hidden">
              {/* Hour grid */}
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="absolute top-0 bottom-0 border-l border-border/30"
                  style={{ left: `${(h / 24) * W}%` }} />
              ))}
              {rows.map(([a, b], i) => (
                <div key={i}
                  className="absolute top-1 bottom-1 bg-primary/70 rounded-sm"
                  style={{ left: `${(a / 24) * W}%`, width: `${((b - a) / 24) * W}%`, boxShadow: "0 0 12px hsl(var(--primary) / 0.5)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

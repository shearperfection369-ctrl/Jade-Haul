import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Full-viewport ambient glow that illuminates the screen edges while JADE is
 * generating a response. Non-interactive (pointer-events: none). Listens for
 * two custom window events:
 *
 *    window.dispatchEvent(new Event("jade:thinking-start"))
 *    window.dispatchEvent(new Event("jade:thinking-end"))
 *
 * Any component doing an AI call can wrap its request with those events to
 * light up the frame. See `useJadeThinking` helper below.
 */
export default function JadeAmbientGlow() {
  const [active, setActive] = useState(false);
  const [depth, setDepth] = useState(0); // stack depth so overlapping calls behave

  useEffect(() => {
    const start = () => setDepth((d) => d + 1);
    const end = () => setDepth((d) => Math.max(0, d - 1));
    window.addEventListener("jade:thinking-start", start);
    window.addEventListener("jade:thinking-end", end);
    return () => {
      window.removeEventListener("jade:thinking-start", start);
      window.removeEventListener("jade:thinking-end", end);
    };
  }, []);

  useEffect(() => {
    setActive(depth > 0);
  }, [depth]);

  return (
    <>
      <div
        className={`jade-ambient-glow fixed inset-0 pointer-events-none z-[70] transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0"}`}
        aria-hidden
        data-testid="jade-ambient-glow"
        data-active={active ? "true" : "false"}
      >
        {/* Inset pulsing halo */}
        <div className="absolute inset-0 jade-glow-pulse" />

        {/* Traveling scan lines on each edge */}
        <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden">
          <div className="jade-scan-x-forward absolute top-0 left-0 h-full w-[45%]" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden">
          <div className="jade-scan-x-back absolute bottom-0 right-0 h-full w-[45%]" />
        </div>
        <div className="absolute top-0 bottom-0 left-0 w-[3px] overflow-hidden">
          <div className="jade-scan-y-down absolute top-0 left-0 w-full h-[45%]" />
        </div>
        <div className="absolute top-0 bottom-0 right-0 w-[3px] overflow-hidden">
          <div className="jade-scan-y-up absolute bottom-0 right-0 w-full h-[45%]" />
        </div>

        {/* Corner brackets */}
        <Corner className="top-3 left-3" rotate={0} />
        <Corner className="top-3 right-3" rotate={90} />
        <Corner className="bottom-3 right-3" rotate={180} />
        <Corner className="bottom-3 left-3" rotate={270} />
      </div>

      {/* Status pill in the corner (still non-interactive) */}
      <div
        className={`fixed bottom-4 left-4 z-[71] pointer-events-none transition-all duration-500 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        aria-hidden
        data-testid="jade-thinking-pill"
      >
        <div className="jade-glass rounded-full px-3 py-1.5 border border-primary/40 flex items-center gap-2 shadow-[0_0_20px_hsl(var(--primary)/0.35)]">
          <div className="relative w-4 h-4 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full scan-ring border border-primary/60" />
            <Sparkles className="w-2.5 h-2.5 text-primary" />
          </div>
          <span className="mono text-[10px] tracking-[0.3em] uppercase text-primary">JADE · Thinking</span>
        </div>
      </div>
    </>
  );
}

function Corner({ className, rotate }) {
  return (
    <div
      className={`absolute w-10 h-10 ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(hsl(var(--primary) / 0.85), transparent 60%)",
          clipPath: "polygon(0 0, 100% 0, 100% 2px, 2px 2px, 2px 100%, 0 100%)",
          filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.7))",
        }}
      />
    </div>
  );
}

/**
 * Convenience helper — wrap any async work in start/end events.
 *   await withJadeThinking(async () => api.post(...))
 */
export async function withJadeThinking(fn) {
  window.dispatchEvent(new Event("jade:thinking-start"));
  try {
    return await fn();
  } finally {
    window.dispatchEvent(new Event("jade:thinking-end"));
  }
}

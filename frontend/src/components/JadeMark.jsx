import React from "react";

/**
 * Jade Haul · JadeOS branding mark.
 * - "J" inside a lime/yellow-green tile (matches JadeOS marketing site)
 * - Wordmark with "JADE HAUL" + "A JADEOS PRODUCT · MPLS"
 *
 * size: "sm" (sidebar) | "md" | "lg" (hero)
 */
export default function JadeMark({ size = "sm", showWord = true, subtitle }) {
  const tile = size === "lg" ? "w-12 h-12 rounded-md" : size === "md" ? "w-10 h-10 rounded-md" : "w-9 h-9 rounded";
  const j = size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl";
  const title = size === "lg" ? "text-2xl" : "text-lg";
  const sub = size === "lg" ? "text-[11px]" : "text-[10px]";

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={`${tile} flex items-center justify-center font-[Unbounded] font-extrabold relative`}
        style={{
          background: "var(--lime, #D4FF00)",
          color: "#0A0F0E",
          boxShadow: "0 0 18px rgba(212,255,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.2)",
        }}
      >
        <span className={`${j} leading-none`}>J</span>
        {/* corner brackets — HUD style */}
        <span className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-foreground/40" />
        <span className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-foreground/40" />
      </div>
      {showWord && (
        <div className="leading-tight">
          <div className={`font-[Unbounded] font-extrabold ${title} tracking-tight`}>
            JADE<span className="text-primary"> HAUL</span>
          </div>
          <div className={`mono ${sub} text-muted-foreground uppercase tracking-[0.28em]`}>
            {subtitle || "A JadeOS Product · MPLS"}
          </div>
        </div>
      )}
    </div>
  );
}

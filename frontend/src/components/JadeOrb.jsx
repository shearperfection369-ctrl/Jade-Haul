import React from "react";
import { motion } from "framer-motion";

/** JADE central voice orb — idle breathing or active listening/speaking */
export default function JadeOrb({ state = "idle", size = 220 }) {
  const isActive = state === "listening" || state === "speaking";
  const bars = 24;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} data-testid="jade-orb">
      {/* Outer halos */}
      {[1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-primary/30"
          style={{ width: size + i * 28, height: size + i * 28 }}
          animate={isActive ? { scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] } : { scale: 1, opacity: 0.25 }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
      {/* Core */}
      <div
        className={`rounded-full ${isActive ? "orb-listening" : "orb-pulse"}`}
        style={{
          width: size * 0.7,
          height: size * 0.7,
          background:
            "radial-gradient(circle at 30% 30%, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.4) 55%, hsl(var(--background)) 100%)",
          boxShadow: "0 0 80px hsl(var(--primary) / 0.6), inset 0 0 40px hsl(var(--primary) / 0.5)",
        }}
      />
      {/* Frequency bars when speaking */}
      {state === "speaking" && (
        <div className="absolute bottom-0 flex items-end gap-[3px] h-10">
          {Array.from({ length: bars }).map((_, i) => (
            <motion.div
              key={i}
              className="w-[3px] rounded-full bg-primary"
              animate={{ height: [4, Math.random() * 38 + 6, 6] }}
              transition={{ duration: 0.4 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.03 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

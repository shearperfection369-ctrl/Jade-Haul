import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Apple-Watch-style holo-orb biometric scanner.
 * Captures live webcam, masks it inside a circle, and overlays scanning rings.
 * Calls onComplete() once the simulated "scan" finishes (3.5s).
 */
export default function HoloOrb({ onComplete, scanning }) {
  const videoRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 480 }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamReady(true);
        }
      } catch {
        setStreamReady(false);
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!scanning) return;
    setProgress(0);
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 3500);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        onComplete?.();
      }
    }, 50);
    return () => clearInterval(id);
  }, [scanning, onComplete]);

  const SIZE = 280;
  const R = SIZE / 2 - 10;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * (1 - progress);

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }} data-testid="holo-orb">
      {/* Outer rotating ring */}
      <svg className="absolute inset-0 scan-ring" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke="hsl(var(--primary) / 0.25)" strokeWidth="1.5"
          strokeDasharray="8 4" />
      </svg>
      {/* Reverse ring */}
      <svg className="absolute inset-2 scan-ring-rev" viewBox={`0 0 ${SIZE - 16} ${SIZE - 16}`}>
        <circle cx={(SIZE - 16) / 2} cy={(SIZE - 16) / 2} r={R - 12} fill="none"
          stroke="hsl(var(--primary) / 0.15)" strokeWidth="1" strokeDasharray="2 6" />
      </svg>
      {/* Progress ring */}
      <svg className="absolute inset-0" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dash}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary)))", transition: "stroke-dashoffset 0.05s linear" }} />
      </svg>

      {/* Webcam circle */}
      <motion.div
        className="absolute rounded-full overflow-hidden ring-2 ring-primary/40"
        style={{ left: 30, top: 30, width: SIZE - 60, height: SIZE - 60 }}
        animate={{ scale: scanning ? [1, 1.02, 1] : 1 }}
        transition={{ repeat: scanning ? Infinity : 0, duration: 1.4 }}
      >
        {streamReady ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-card to-background flex items-center justify-center">
            <span className="mono text-xs text-muted-foreground">CAM · OFFLINE</span>
          </div>
        )}
        {/* Scanning bar */}
        {scanning && (
          <motion.div
            className="absolute left-0 right-0 h-[2px] bg-primary"
            style={{ boxShadow: "0 0 14px hsl(var(--primary))" }}
            initial={{ top: 0 }}
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        )}
      </motion.div>

      {/* Tick marks */}
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i / 36) * Math.PI * 2;
        const inner = R - 14;
        const outer = R - 6;
        return (
          <div
            key={i}
            className="absolute origin-bottom"
            style={{
              width: 1,
              height: outer - inner,
              left: SIZE / 2 - 0.5,
              top: SIZE / 2 - outer,
              transform: `rotate(${(i / 36) * 360}deg) translateY(0)`,
              background: i % 3 === 0 ? "hsl(var(--primary) / 0.8)" : "hsl(var(--muted-foreground) / 0.4)",
              transformOrigin: `0.5px ${outer}px`,
            }}
          />
        );
      })}
    </div>
  );
}

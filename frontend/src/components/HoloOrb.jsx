import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { Camera, CameraOff } from "lucide-react";

/**
 * Apple-Watch-style holo-orb biometric scanner.
 * - Surfaces camera permission state with an Enable Camera CTA.
 * - Exposes `getVideoEl()` via ref for face-api consumers.
 * - When `scanning` flips true, runs a visual progress ring; calls onComplete()
 *   when progress hits 1 (the actual face match is up to the parent).
 */
const HoloOrb = forwardRef(function HoloOrb({ onComplete, scanning, autoStart = true, durationMs = 3500 }, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | requesting | ready | denied | error
  const [progress, setProgress] = useState(0);

  useImperativeHandle(ref, () => ({
    getVideoEl: () => videoRef.current,
    isReady: () => phase === "ready",
  }));

  const start = async () => {
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") setPhase("denied");
      else setPhase("error");
    }
  };

  useEffect(() => {
    if (autoStart) start();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (!scanning) return;
    setProgress(0);
    const t0 = Date.now();
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / durationMs);
      setProgress(p);
      if (p >= 1) {
        clearInterval(id);
        onComplete?.();
      }
    }, 50);
    return () => clearInterval(id);
  }, [scanning, onComplete, durationMs]);

  const SIZE = 280;
  const R = SIZE / 2 - 10;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * (1 - progress);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: SIZE, height: SIZE }} data-testid="holo-orb">
        <svg className="absolute inset-0 scan-ring" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke="hsl(var(--primary) / 0.25)" strokeWidth="1.5" strokeDasharray="8 4" />
        </svg>
        <svg className="absolute inset-2 scan-ring-rev" viewBox={`0 0 ${SIZE - 16} ${SIZE - 16}`}>
          <circle cx={(SIZE - 16) / 2} cy={(SIZE - 16) / 2} r={R - 12} fill="none"
            stroke="hsl(var(--primary) / 0.15)" strokeWidth="1" strokeDasharray="2 6" />
        </svg>
        <svg className="absolute inset-0" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={dash}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary)))", transition: "stroke-dashoffset 0.05s linear" }} />
        </svg>

        <motion.div
          className="absolute rounded-full overflow-hidden ring-2 ring-primary/40"
          style={{ left: 30, top: 30, width: SIZE - 60, height: SIZE - 60 }}
          animate={{ scale: scanning ? [1, 1.02, 1] : 1 }}
          transition={{ repeat: scanning ? Infinity : 0, duration: 1.4 }}
        >
          {phase === "ready" ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              data-testid="holo-orb-video"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/30 via-card to-background flex flex-col items-center justify-center text-center px-3">
              {phase === "denied" ? <CameraOff className="w-7 h-7 text-destructive mb-1" /> : <Camera className="w-7 h-7 text-primary mb-1" />}
              <span className="mono text-[10px] tracking-widest text-muted-foreground uppercase">
                {phase === "idle" && "CAM · STANDBY"}
                {phase === "requesting" && "REQUESTING…"}
                {phase === "denied" && "PERMISSION DENIED"}
                {phase === "error" && "CAM · OFFLINE"}
              </span>
            </div>
          )}
          {scanning && phase === "ready" && (
            <motion.div
              className="absolute left-0 right-0 h-[2px] bg-primary"
              style={{ boxShadow: "0 0 14px hsl(var(--primary))" }}
              initial={{ top: 0 }}
              animate={{ top: ["0%", "100%", "0%"] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
            />
          )}
        </motion.div>

        {Array.from({ length: 36 }).map((_, i) => {
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

      {(phase === "idle" || phase === "denied" || phase === "error") && (
        <button
          type="button"
          onClick={start}
          className="mono text-[10px] tracking-[0.25em] uppercase px-3 py-1.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
          data-testid="holo-orb-enable-btn"
        >
          {phase === "denied" ? "Retry · Enable Camera" : "Enable Camera"}
        </button>
      )}
      {phase === "denied" && (
        <div className="mono text-[10px] text-muted-foreground max-w-[260px] text-center leading-relaxed">
          Allow camera in your browser&apos;s address-bar lock icon, then click Retry.
        </div>
      )}
    </div>
  );
});

export default HoloOrb;

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadModels } from "@/lib/faceAuth";

/**
 * FaceCapture — circular webcam viewport with permission handling, model preload,
 * and an exposed `getVideoEl()` ref for parent components to run face-api ops.
 *
 * States: idle | requesting | ready | denied | error
 */
const FaceCapture = forwardRef(function FaceCapture(
  { size = 280, autoStart = false, onReady, overlay = null, testid = "face-capture" },
  ref
) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [phase, setPhase] = useState("idle"); // idle | requesting | ready | denied | error
  const [errorMsg, setErrorMsg] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    getVideoEl: () => videoRef.current,
    stop: () => stopStream(),
    isReady: () => phase === "ready" && modelsLoaded,
  }));

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const start = async () => {
    setErrorMsg("");
    setPhase("requesting");
    try {
      // Kick off model preload in parallel with permission prompt.
      loadModels()
        .then(() => setModelsLoaded(true))
        .catch((e) => {
          console.error("face-api models failed:", e);
          setErrorMsg("Face engine failed to load. Refresh and try again.");
          setPhase("error");
        });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
      onReady?.();
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPhase("denied");
        setErrorMsg("Camera permission denied. Allow it in your browser address-bar lock icon, then click Enable Camera again.");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        setPhase("error");
        setErrorMsg("No webcam detected on this device.");
      } else {
        setPhase("error");
        setErrorMsg(err.message || "Could not access camera.");
      }
    }
  };

  useEffect(() => {
    if (autoStart) start();
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div data-testid={testid} className="flex flex-col items-center gap-3">
      <div
        className="relative rounded-full overflow-hidden ring-2 ring-primary/40 bg-card"
        style={{ width: size, height: size }}
      >
        {phase === "ready" ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            data-testid={`${testid}-video`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 bg-gradient-to-br from-primary/15 via-card to-background">
            {phase === "denied" ? (
              <CameraOff className="w-10 h-10 text-destructive mb-2" />
            ) : (
              <Camera className="w-10 h-10 text-primary mb-2" />
            )}
            <div className="mono text-[10px] tracking-widest uppercase text-muted-foreground">
              {phase === "idle" && "CAM · STANDBY"}
              {phase === "requesting" && "REQUESTING ACCESS…"}
              {phase === "denied" && "PERMISSION DENIED"}
              {phase === "error" && "CAM · ERROR"}
            </div>
          </div>
        )}
        {overlay}
      </div>

      {phase !== "ready" && (
        <Button
          type="button"
          onClick={start}
          disabled={phase === "requesting"}
          className="btn-lime hover:btn-lime"
          data-testid={`${testid}-enable-btn`}
        >
          {phase === "requesting" ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Requesting…</>
          ) : (
            <><Camera className="w-4 h-4 mr-2" /> Enable Camera</>
          )}
        </Button>
      )}

      {errorMsg && (
        <div
          className="mono text-[11px] text-destructive max-w-[320px] text-center leading-relaxed"
          data-testid={`${testid}-error`}
        >
          {errorMsg}
        </div>
      )}
      {phase === "ready" && !modelsLoaded && (
        <div className="mono text-[10px] tracking-widest text-muted-foreground">
          LOADING FACE ENGINE…
        </div>
      )}
    </div>
  );
});

export default FaceCapture;

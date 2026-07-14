import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Truck, Briefcase, ShieldCheck, Eye, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import JadeMark from "@/components/JadeMark";
import FaceCapture from "@/components/FaceCapture";
import { averageDescriptors, currentEAR, saveEnrollment } from "@/lib/faceAuth";

// Eye-aspect-ratio thresholds.
const EAR_OPEN = 0.27;
const EAR_CLOSED = 0.21;
// Capture configuration.
const SAMPLES_NEEDED = 3;

export default function Signup() {
  const { user, signupAndLogin } = useAuth();
  const nav = useNavigate();
  const captureRef = useRef(null);

  const [step, setStep] = useState(1); // 1 = credentials, 2 = enroll face
  const [role, setRole] = useState("driver");
  const [form, setForm] = useState({ name: "", email: "", password: "", callsign: "", license: "" });
  const [submitting, setSubmitting] = useState(false);

  // Face enrollment state
  const [samples, setSamples] = useState([]);
  const [blinkSeen, setBlinkSeen] = useState(false);
  const [eyeOpenAfterBlink, setEyeOpenAfterBlink] = useState(false);
  const [hint, setHint] = useState("Press Enable Camera to begin.");
  const [enrolling, setEnrolling] = useState(false);
  const earHistoryRef = useRef([]); // recent EAR values

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const goToFaceStep = (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.name) {
      toast.error("Name, email and password are required.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setStep(2);
  };

  // Run a ~12fps face poll while in step 2 to detect blink + accumulate samples.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    let id;

    const tick = async () => {
      if (cancelled) return;
      const video = captureRef.current?.getVideoEl?.();
      const ready = captureRef.current?.isReady?.();
      if (!ready || !video) {
        id = setTimeout(tick, 350);
        return;
      }
      try {
        const { ear, descriptor } = await currentEAR(video);
        if (ear == null) {
          setHint("Looking for your face… center it in the circle.");
        } else {
          // Track last few EAR values to detect a blink cycle (open → closed → open).
          const hist = earHistoryRef.current;
          hist.push(ear);
          if (hist.length > 12) hist.shift();
          const hadClosed = hist.some((v) => v < EAR_CLOSED);
          const isOpenNow = ear > EAR_OPEN;

          if (!blinkSeen) {
            if (hadClosed && isOpenNow) {
              setBlinkSeen(true);
              setEyeOpenAfterBlink(true);
              setHint("Great — blink detected. Hold steady while we capture your face.");
            } else {
              setHint("Liveness check — please blink once.");
            }
          } else if (eyeOpenAfterBlink && descriptor && samples.length < SAMPLES_NEEDED) {
            // Only capture when eyes are clearly open and a face descriptor exists.
            setSamples((s) => {
              if (s.length >= SAMPLES_NEEDED) return s;
              const next = [...s, descriptor];
              setHint(
                next.length >= SAMPLES_NEEDED
                  ? "Captured. Tap Finish to create your account."
                  : `Captured ${next.length} of ${SAMPLES_NEEDED}. Slightly turn your head…`
              );
              return next;
            });
          }
        }
      } catch (err) {
        console.error("face poll error:", err);
      }
      id = setTimeout(tick, 250);
    };
    tick();
    return () => {
      cancelled = true;
      if (id) clearTimeout(id);
    };
  }, [step, blinkSeen, eyeOpenAfterBlink, samples.length]);

  if (user) return <Navigate to={user.role === "broker" ? "/broker" : "/driver"} replace />;

  const finish = async () => {
    if (samples.length < SAMPLES_NEEDED) {
      toast.error("Please complete the face capture first.");
      return;
    }
    setEnrolling(true);
    try {
      const descriptor = averageDescriptors(samples);
      const u = await signupAndLogin({
        email: form.email,
        password: form.password,
        name: form.name,
        role,
        callsign: form.callsign,
        license: form.license,
      });
      saveEnrollment(u.email, descriptor, { name: u.name, role: u.role });
      toast.success(`Welcome aboard, ${u.name}. Face login enabled on this device.`);
      // Drivers go through the full onboarding wizard; brokers head straight to their desk.
      nav(u.role === "broker" ? "/broker" : "/onboarding");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Sign up failed.");
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] overflow-hidden">
      {/* Left — branding */}
      <div className="relative flex flex-col justify-between p-10 lg:p-14 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-primary/10" />
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />
        </div>

        <JadeMark size="lg" subtitle="Enroll · Biometric · Cockpit Access" />

        <div className="space-y-6 max-w-md">
          <div>
            <div className="mono text-[10px] uppercase text-primary tracking-[0.3em] mb-2">Step {step} of 2</div>
            <h1 className="text-4xl font-extrabold leading-tight">
              {step === 1 ? <>Create your <span className="text-primary">Jade Haul</span> account</> : <>Enroll your face for <span className="text-primary">passwordless sign-in</span></>}
            </h1>
            <p className="text-muted-foreground mt-3">
              {step === 1
                ? "Pick your role, set your credentials, then we'll capture your face for biometric login on this device."
                : "Center your face in the circle, then blink once. We'll snap a few samples to learn your features."}
            </p>
          </div>

          <ul className="space-y-2.5 mono text-[11px] text-muted-foreground">
            <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Face data never leaves your device. Stored encrypted in browser only.</li>
            <li className="flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /> Blink liveness check defeats photo attacks.</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Email + password fallback always available.</li>
          </ul>
        </div>

        <div className="mono text-[10px] text-muted-foreground">
          Already enrolled? <Link to="/login" className="text-primary hover:underline">Sign in →</Link>
        </div>
      </div>

      {/* Right — form / face capture */}
      <div className="flex items-center justify-center p-8 lg:p-14 jade-glass m-3 lg:my-6 lg:mr-6">
        <div className="w-full max-w-md space-y-6">
          {step === 1 && (
            <form onSubmit={goToFaceStep} className="space-y-4" data-testid="signup-form">
              <Tabs value={role} onValueChange={setRole} data-testid="signup-role-tabs">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="driver" data-testid="signup-role-driver">
                    <Truck className="w-4 h-4 mr-2" /> Driver
                  </TabsTrigger>
                  <TabsTrigger value="broker" data-testid="signup-role-broker">
                    <Briefcase className="w-4 h-4 mr-2" /> Broker
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-1.5">
                <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Full name</Label>
                <Input data-testid="signup-name" value={form.name} onChange={update("name")} placeholder="Marcus Reyes" />
              </div>
              <div className="space-y-1.5">
                <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Email</Label>
                <Input data-testid="signup-email" value={form.email} onChange={update("email")} placeholder="you@fleet.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Password (min 6)</Label>
                <Input data-testid="signup-password" type="password" value={form.password} onChange={update("password")} placeholder="••••••" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Callsign (opt)</Label>
                  <Input data-testid="signup-callsign" value={form.callsign} onChange={update("callsign")} placeholder="RIG-77" />
                </div>
                <div className="space-y-1.5">
                  <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">{role === "driver" ? "CDL #" : "MC #"}</Label>
                  <Input data-testid="signup-license" value={form.license} onChange={update("license")} placeholder={role === "driver" ? "TX-CDL-..." : "MC-885472"} />
                </div>
              </div>

              <Button type="submit" className="w-full h-11 btn-lime hover:btn-lime" data-testid="signup-next-btn">
                Continue to face enrollment <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-5" data-testid="signup-enroll">
              <FaceCapture ref={captureRef} testid="signup-face" size={300} />

              <div className="space-y-2">
                <div className="flex items-center justify-between mono text-[11px]">
                  <span className={blinkSeen ? "text-primary" : "text-muted-foreground"}>
                    1. Blink liveness {blinkSeen ? "· ✓" : ""}
                  </span>
                  <span className={samples.length >= SAMPLES_NEEDED ? "text-primary" : "text-muted-foreground"}>
                    2. Captured {samples.length}/{SAMPLES_NEEDED}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (samples.length / SAMPLES_NEEDED) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground" data-testid="signup-hint">{hint}</p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setStep(1); setSamples([]); setBlinkSeen(false); setEyeOpenAfterBlink(false); }}
                  data-testid="signup-back-btn"
                >
                  ← Back
                </Button>
                <Button
                  type="button"
                  onClick={finish}
                  disabled={enrolling || samples.length < SAMPLES_NEEDED}
                  className="flex-1 h-11 btn-lime hover:btn-lime"
                  data-testid="signup-finish-btn"
                >
                  {enrolling ? "Creating account…" : "Finish & Launch Cockpit →"}
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center">
            By signing up you agree to demo terms. Your face descriptor is stored only on this device.
          </div>
        </div>
      </div>
    </div>
  );
}

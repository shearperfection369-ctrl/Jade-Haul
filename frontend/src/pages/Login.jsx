import React, { useRef, useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import HoloOrb from "@/components/HoloOrb";
import JadeMark from "@/components/JadeMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Truck, Briefcase, Fingerprint, Shield, Scan, UserPlus, Play } from "lucide-react";
import { detectFace, findBestMatch, listEnrollments, loadModels, areModelsReady, MATCH_THRESHOLD, FAST_MATCH_THRESHOLD } from "@/lib/faceAuth";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const orbRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [persona, setPersona] = useState("driver");
  const [email, setEmail] = useState("driver@jadeos.com");
  const [password, setPassword] = useState("jade123");
  const [faceStatus, setFaceStatus] = useState("");
  const [scanConfidence, setScanConfidence] = useState(0);
  const [simLaunching, setSimLaunching] = useState(false);

  // Preload face-api models the moment this page mounts so the first click
  // on "Sign in with Face" is instant. Failsafe — App.js also preloads.
  React.useEffect(() => {
    if (!areModelsReady()) loadModels().catch(() => {});
  }, []);

  if (user) return <Navigate to={user.role === "broker" ? "/broker" : "/driver"} replace />;

  const enrollments = listEnrollments();
  const hasEnrollments = enrollments.length > 0;

  const triggerDemoScan = () => setScanning(true);

  const onDemoScanComplete = async () => {
    setScanning(false);
    const creds = persona === "driver"
      ? { email: "driver@jadeos.com", password: "jade123" }
      : { email: "broker@jadeos.com", password: "jade123" };
    try {
      const u = await login(creds.email, creds.password);
      toast.success(`Welcome aboard, ${u.name}`);
      nav(u.role === "broker" ? "/broker" : "/driver");
    } catch {
      toast.error("Biometric verification failed");
    }
  };

  // Real face-match login — bulletproof version.
  // Preloaded models · 8s search window · 180ms polling · live confidence · auto-retry.
  const triggerFaceLogin = async () => {
    if (!hasEnrollments) {
      toast.error("No face is enrolled on this device. Sign up first.");
      return;
    }
    const video = orbRef.current?.getVideoEl?.();
    if (!video || !orbRef.current?.isReady?.()) {
      toast.error("Enable the camera first.");
      return;
    }

    setFaceStatus(areModelsReady() ? "Warming up…" : "Loading face engine…");
    setScanConfidence(0);
    try {
      await loadModels();
    } catch {
      toast.error("Face engine failed to load.");
      setFaceStatus("");
      return;
    }

    setScanning(true);
    const runScanPass = async (durationMs) => {
      let bestSoFar = null;
      const t0 = Date.now();
      while (Date.now() - t0 < durationMs) {
        // eslint-disable-next-line no-await-in-loop
        const det = await detectFace(video);
        if (det?.descriptor) {
          const m = findBestMatch(det.descriptor);
          if (m) {
            const conf = Math.max(0, Math.min(1, 1 - m.distance / MATCH_THRESHOLD));
            setScanConfidence(conf);
            setFaceStatus(`Matching ${m.email} · ${Math.round(conf * 100)}%`);
            if (!bestSoFar || m.distance < bestSoFar.distance) bestSoFar = m;
            // Fast-accept if we get a very confident hit.
            if (m.distance <= FAST_MATCH_THRESHOLD) return bestSoFar;
          } else {
            setFaceStatus("Face detected — looking for match…");
          }
        } else {
          setFaceStatus("Center your face in the ring…");
          setScanConfidence(0);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 180));
      }
      return bestSoFar;
    };

    // First pass: 5s
    let matched = await runScanPass(5000);
    // If we saw *something* but not a fast accept, try one quick retry (3s).
    if (!matched || matched.distance > MATCH_THRESHOLD) {
      setFaceStatus("Retrying — hold still…");
      const retry = await runScanPass(3000);
      if (retry && (!matched || retry.distance < matched.distance)) matched = retry;
    }
    setScanning(false);

    if (!matched || matched.distance > MATCH_THRESHOLD) {
      setFaceStatus("");
      setScanConfidence(0);
      toast.error("Face not recognized. Try again in better light — or use your password.");
      return;
    }

    setFaceStatus(`Verified · ${matched.email} · ${Math.round((1 - matched.distance) * 100)}% confidence`);

    // Demo-account fast path
    if (matched.email === "driver@jadeos.com" || matched.email === "broker@jadeos.com") {
      try {
        const u = await login(matched.email, "jade123");
        toast.success(`Welcome aboard, ${u.name}`);
        nav(u.role === "broker" ? "/broker" : "/driver");
        return;
      } catch {
        toast.error("Login failed.");
        return;
      }
    }

    // Custom-signed-up users: prompt password once on this device.
    const pw = window.prompt(
      `Face matched ${matched.email}. Confirm your password to finish sign-in (one time on this device):`
    );
    if (!pw) {
      toast.message("Sign in canceled.");
      return;
    }
    try {
      const u = await login(matched.email, pw);
      toast.success(`Welcome back, ${u.name}`);
      nav(u.role === "broker" ? "/broker" : "/driver");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Password did not match.");
    }
  };

  const onCredentialLogin = async (e) => {
    e.preventDefault();
    try {
      const u = await login(email, password);
      toast.success(`Welcome, ${u.name}`);
      nav(u.role === "broker" ? "/broker" : "/driver");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    }
  };

  const runSampleSimulation = async () => {
    if (simLaunching) return;
    setSimLaunching(true);
    try {
      const { data } = await (await import("@/lib/api")).api.post("/simulation/start", { new_trucker: true });
      // Persist the returned token, then hard-navigate so AuthProvider re-bootstraps.
      localStorage.setItem("jadeos.token", data.token);
      // Mark this session so /onboarding knows to pre-populate + short-flow.
      sessionStorage.setItem("jadehaul.sim.autostart", JSON.stringify({
        sim_id: data.sim_id,
        name: data.user.name,
        email: data.user.email,
      }));
      toast.success(`Sample trucker "${data.user.name}" launched. Setting up cockpit…`);
      window.location.href = "/onboarding";
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not start simulation.");
      setSimLaunching(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] overflow-hidden">
      {/* Left — branding / orb */}
      <div className="relative flex flex-col justify-between p-10 lg:p-14 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.pexels.com/photos/24343234/pexels-photo-24343234.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1400"
            alt=""
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-primary/10" />
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: "linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />
        </div>

        <JadeMark size="lg" subtitle="A JadeOS Product · MPLS Node" />

        <div className="my-10 flex flex-col items-center">
          <HoloOrb ref={orbRef} scanning={scanning} onComplete={onDemoScanComplete} />
          <div className="mono text-xs text-muted-foreground mt-6 tracking-widest" data-testid="holo-status">
            {scanning ? "BIOMETRIC SCAN · ACTIVE" : (faceStatus || (hasEnrollments ? `${enrollments.length} FACE${enrollments.length > 1 ? "S" : ""} ON FILE · TAP SCAN-IN` : "AWAITING BIOMETRIC · ENROLL TO BEGIN"))}
          </div>
          {scanning && (
            <div className="mt-3 w-64 max-w-full" data-testid="scan-confidence">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{
                    width: `${Math.round(scanConfidence * 100)}%`,
                    boxShadow: "0 0 12px hsl(var(--primary))",
                  }}
                />
              </div>
              <div className="flex justify-between mono text-[9px] tracking-widest text-muted-foreground mt-1 uppercase">
                <span>{Math.round(scanConfidence * 100)}%</span>
                <span>{faceStatus.split("·")[1]?.trim() || "Verifying"}</span>
              </div>
            </div>
          )}
          {hasEnrollments && (
            <Button
              type="button"
              onClick={triggerFaceLogin}
              className="mt-4 btn-lime hover:btn-lime"
              data-testid="face-login-btn"
              disabled={scanning}
            >
              <Scan className="w-4 h-4 mr-2" /> Sign in with Face
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-[11px] mono text-muted-foreground">
          <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-primary" /> ELD-COMPLIANT</div>
          <div className="flex items-center gap-2"><Fingerprint className="w-3.5 h-3.5 text-primary" /> BIOMETRIC LOGIN</div>
          <div className="flex items-center gap-2"><Truck className="w-3.5 h-3.5 text-primary" /> CLAUDE-POWERED</div>
        </div>
      </div>

      {/* Right — auth */}
      <div className="flex items-center justify-center p-8 lg:p-14 jade-glass m-3 lg:my-6 lg:mr-6">
        <div className="w-full max-w-md space-y-7">
          <div>
            <div className="mono text-[10px] uppercase text-primary tracking-[0.3em] mb-2">Welcome to the Cockpit</div>
            <h1 className="text-4xl font-extrabold leading-tight">Sign in to <span className="text-primary">Jade Haul</span></h1>
            <p className="text-muted-foreground mt-2">Pick your persona, then scan-in with the holo-orb or use credentials.</p>
          </div>

          <Tabs value={persona} onValueChange={setPersona} data-testid="persona-tabs">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="driver" data-testid="persona-driver">
                <Truck className="w-4 h-4 mr-2" /> Driver
              </TabsTrigger>
              <TabsTrigger value="broker" data-testid="persona-broker">
                <Briefcase className="w-4 h-4 mr-2" /> Broker
              </TabsTrigger>
            </TabsList>

            <TabsContent value="driver" className="mt-5">
              <BiometricCTA onScan={triggerDemoScan} scanning={scanning} testid="driver-scan-btn"
                label="Scan-in as Marcus Reyes (demo)" subtitle="CDL · TX-CDL-4429183 · Reyes Trucking LLC" />
            </TabsContent>
            <TabsContent value="broker" className="mt-5">
              <BiometricCTA onScan={triggerDemoScan} scanning={scanning} testid="broker-scan-btn"
                label="Scan-in as Aria Chen (demo)" subtitle="Broker MC-885472 · Atlas Freight Desk" />
            </TabsContent>
          </Tabs>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-[10px] uppercase mono">
              <span className="bg-background px-2 text-muted-foreground tracking-[0.3em]">Or credentials</span>
            </div>
          </div>

          <form onSubmit={onCredentialLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Email</Label>
              <Input id="email" data-testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pass" className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Password</Label>
              <Input id="pass" type="password" data-testid="login-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full h-11 mt-2 btn-lime hover:btn-lime" data-testid="login-submit">
              Launch Cockpit →
            </Button>
          </form>

          <Link
            to="/signup"
            className="flex items-center justify-center gap-2 mono text-[11px] uppercase tracking-[0.25em] text-primary hover:underline"
            data-testid="signup-link"
          >
            <UserPlus className="w-3.5 h-3.5" /> Create account & enroll face
          </Link>

          {/* Sample trucker simulation — creates a fresh account + kicks off scripted route */}
          <button
            type="button"
            onClick={runSampleSimulation}
            disabled={simLaunching}
            className="w-full jade-panel border border-primary/40 hover:border-primary/70 hover:bg-primary/5 transition-all rounded-xl p-3 flex items-center gap-3 group"
            data-testid="sample-sim-btn"
          >
            <div className="relative w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full scan-ring border border-primary/50" />
              <Play className="w-4 h-4 text-primary ml-0.5" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="text-sm font-semibold">{simLaunching ? "Launching sample trucker…" : "Try a sample trucker simulation"}</div>
              <div className="mono text-[10px] text-muted-foreground tracking-widest uppercase">Fresh account · Fort Worth → Phoenix · live events</div>
            </div>
          </button>

          <div className="mono text-[10px] text-muted-foreground leading-relaxed">
            Demo accounts · driver@jadeos.com / jade123 · broker@jadeos.com / jade123
          </div>
        </div>
      </div>
    </div>
  );
}

function BiometricCTA({ onScan, scanning, label, subtitle, testid }) {
  return (
    <div className="jade-panel p-4 flex items-center gap-4">
      <div className="relative w-12 h-12 shrink-0">
        <div className="absolute inset-0 rounded-full border border-primary/40 scan-ring" />
        <Fingerprint className="absolute inset-0 m-auto w-6 h-6 text-primary" />
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        <div className="mono text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
      <Button onClick={onScan} disabled={scanning} data-testid={testid}>
        {scanning ? "Scanning…" : "Scan"}
      </Button>
    </div>
  );
}

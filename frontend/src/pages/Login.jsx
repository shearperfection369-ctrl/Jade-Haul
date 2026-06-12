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
import { Truck, Briefcase, Fingerprint, Shield, Scan, UserPlus } from "lucide-react";
import { detectFace, findBestMatch, listEnrollments, loadModels } from "@/lib/faceAuth";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const orbRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [persona, setPersona] = useState("driver");
  const [email, setEmail] = useState("driver@jadeos.com");
  const [password, setPassword] = useState("jade123");
  const [faceStatus, setFaceStatus] = useState("");

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

  // Real face-match login against any enrolled descriptor in this browser.
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
    setFaceStatus("Loading face engine…");
    try {
      await loadModels();
    } catch {
      toast.error("Face engine failed to load.");
      setFaceStatus("");
      return;
    }

    setFaceStatus("Looking for you…");
    setScanning(true);
    // Try for ~5 seconds (every ~350ms) to find a match.
    let matched = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000 && !matched) {
      // eslint-disable-next-line no-await-in-loop
      const det = await detectFace(video);
      if (det?.descriptor) {
        const m = findBestMatch(det.descriptor);
        if (m) matched = m;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    }
    setScanning(false);

    if (!matched) {
      setFaceStatus("");
      toast.error("Face not recognized. Try again or use your password.");
      return;
    }

    // Match found — pull the saved password challenge by asking the user.
    // Since we never store passwords, face-match is the auth factor:
    // we issue a token by hitting /auth/login with a per-device "face token"
    // shortcut. Simpler approach: prompt the user to confirm their email
    // and re-use stored credentials for demo users; otherwise ask for password
    // once and remember a session token via /auth/login.
    setFaceStatus(`Matched ${matched.email} · ${Math.round((1 - matched.distance) * 100)}% confidence`);

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

    // For custom-signed-up users, ask them to confirm their password once
    // on this device. (A future iteration can swap this for a device-bound
    // refresh token issued at enrollment.)
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

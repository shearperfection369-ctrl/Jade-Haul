import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import HoloOrb from "@/components/HoloOrb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Truck, Briefcase, Fingerprint, Shield } from "lucide-react";

const JADE_VOICE_URL = "https://customer-assets.emergentagent.com/job_broker-copilot-2/artifacts/ncrcc3sk_01-jade-vigor-code.mp3";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [persona, setPersona] = useState("driver");
  const [email, setEmail] = useState("driver@jadeos.com");
  const [password, setPassword] = useState("jade123");

  if (user) return <Navigate to={user.role === "broker" ? "/broker" : "/driver"} replace />;

  const triggerBiometric = () => {
    setScanning(true);
    try {
      new Audio(JADE_VOICE_URL).play().catch(() => {});
    } catch {
      /* audio unavailable */
    }
  };

  const onBiometricComplete = async () => {
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
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary jade-ring-glow" />
          <div>
            <div className="font-[Unbounded] font-extrabold text-2xl tracking-tight">JADE<span className="text-primary">OS</span></div>
            <div className="mono text-[10px] text-muted-foreground uppercase tracking-[0.3em]">Trucker · Broker · AI Co-pilot</div>
          </div>
        </div>

        <div className="my-10 flex flex-col items-center">
          <HoloOrb scanning={scanning} onComplete={onBiometricComplete} />
          <div className="mono text-xs text-muted-foreground mt-6 tracking-widest">
            {scanning ? "BIOMETRIC SCAN · ACTIVE" : "AWAITING BIOMETRIC · TAP TO SCAN"}
          </div>
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
            <h1 className="text-4xl font-extrabold leading-tight">Sign in to <span className="text-primary">JadeOS</span></h1>
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
              <BiometricCTA onScan={triggerBiometric} scanning={scanning} testid="driver-scan-btn"
                label="Scan-in as Marcus Reyes" subtitle="CDL · TX-CDL-4429183 · Reyes Trucking LLC" />
            </TabsContent>
            <TabsContent value="broker" className="mt-5">
              <BiometricCTA onScan={triggerBiometric} scanning={scanning} testid="broker-scan-btn"
                label="Scan-in as Aria Chen" subtitle="Broker MC-885472 · Atlas Freight Desk" />
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
            <Button type="submit" className="w-full h-11 mt-2" data-testid="login-submit">Sign in</Button>
          </form>

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

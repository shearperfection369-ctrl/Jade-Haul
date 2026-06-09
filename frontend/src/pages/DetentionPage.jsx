import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Timer, Play, Square, DollarSign, MapPin, Radar } from "lucide-react";
import { toast } from "sonner";
import { speak } from "@/lib/tts";

function fmtDur(min) {
  if (min == null) return "--:--:--";
  const total = Math.max(0, Math.round(min * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DetentionPage() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [shipper, setShipper] = useState("FreshHarvest Foods · Phoenix DC");
  const [location, setLocation] = useState("4400 W Buckeye Rd, Phoenix AZ");
  const [autoMode, setAutoMode] = useState(true);
  const [geo, setGeo] = useState(null);
  const watchRef = useRef(null);
  const autoCuedRef = useRef(false);

  const refresh = async () => {
    try {
      const { data } = await api.get("/detention/list");
      setList(data);
      setActive(data.find((d) => !d.end_at) || null);
    } catch (e) {
      console.warn("detention refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto on-site detection — browser geolocation → server geofence check.
  useEffect(() => {
    if (!autoMode || active) {
      if (watchRef.current && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) {
      setGeo({ error: "Browser geolocation unavailable" });
      return;
    }
    const sim = setInterval(async () => {
      // Demo coords: cycle near a known geofence so the auto-cue can fire.
      const demoFences = [
        { lat: 33.4484, lng: -112.0740 }, // Phoenix DC
        { lat: 35.5281, lng: -108.7426 }, // Gallup
      ];
      const f = demoFences[Math.floor(Date.now() / 8000) % demoFences.length];
      try {
        const { data } = await api.post("/geofence/ping", { lat: f.lat, lng: f.lng, speed_mph: 0 });
        setGeo(data);
        if (data.on_site && !autoCuedRef.current && !active) {
          autoCuedRef.current = true;
          setShipper(data.shipper.name);
          setLocation(`${data.shipper.lat.toFixed(3)}, ${data.shipper.lng.toFixed(3)}`);
          await api.post("/detention/start", { shipper_name: data.shipper.name, location: `${data.shipper.lat.toFixed(3)}, ${data.shipper.lng.toFixed(3)}` });
          toast.success(`On-site detected at ${data.shipper.name} — timer started`);
          speak(`On-site at ${data.shipper.name}. Detention timer is now running.`);
          refresh();
        }
      } catch { /* noop */ }
    }, 4000);
    return () => clearInterval(sim);
  }, [autoMode, active]);

  const start = async () => {
    if (!shipper.trim() || !location.trim()) {
      toast.error("Shipper and location required");
      return;
    }
    await api.post("/detention/start", { shipper_name: shipper, location });
    toast.success("Detention timer started");
    refresh();
  };

  const stop = async () => {
    if (!active) return;
    await api.post("/detention/stop", { entry_id: active.id });
    toast.success("Detention logged");
    refresh();
  };

  const elapsedMin = active ? (now - new Date(active.start_at).getTime()) / 60000 : null;

  return (
    <div>
      <PageHeader title="Detention Timer" subtitle="Driver · Billable On-Site Time"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={autoMode} onCheckedChange={setAutoMode} data-testid="detention-auto-toggle" />
              <Label className="text-sm flex items-center gap-1"><Radar className="w-3.5 h-3.5 text-primary" /> Auto-detect on-site</Label>
            </div>
            {geo?.on_site && (
              <Badge className="bg-primary text-primary-foreground"><MapPin className="w-3 h-3 mr-1" /> {geo.shipper.name}</Badge>
            )}
          </div>
        } />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="jade-panel p-6 jade-tracing-border">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Timer className="w-3.5 h-3.5 text-primary" />
            {active ? "Active · billable timer running" : "Idle · ready to track"}
          </div>
          <div className="text-6xl lg:text-7xl font-extrabold mono mt-3 text-primary"
            style={{ textShadow: active ? "0 0 22px hsl(var(--primary) / 0.6)" : undefined }}
            data-testid="detention-timer-display">
            {active ? fmtDur(elapsedMin) : "00:00:00"}
          </div>
          {active && elapsedMin > 120 && (
            <Badge variant="outline" className="mt-3 border-primary/40 text-primary">
              <DollarSign className="w-3 h-3 mr-1" /> Billable threshold passed (&gt;2hr)
            </Badge>
          )}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div>
              <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Shipper</Label>
              <Input value={shipper} onChange={(e) => setShipper(e.target.value)} disabled={!!active} data-testid="detention-shipper" />
            </div>
            <div>
              <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={!!active} data-testid="detention-location" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {!active ? (
              <Button className="flex-1 h-11" onClick={start} data-testid="detention-start-btn">
                <Play className="w-4 h-4 mr-2" /> Start timer
              </Button>
            ) : (
              <Button className="flex-1 h-11" variant="destructive" onClick={stop} data-testid="detention-stop-btn">
                <Square className="w-4 h-4 mr-2" /> Stop & log
              </Button>
            )}
          </div>
        </Card>

        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-3">Detention history</div>
          <div className="space-y-2 max-h-[460px] overflow-y-auto">
            {list.length === 0 && (
              <div className="text-sm text-muted-foreground">No detention entries yet. Start the timer when you arrive on-site.</div>
            )}
            {list.map((d) => (
              <div key={d.id} className="p-3 rounded-lg bg-secondary/60">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{d.shipper_name}</div>
                  <Badge variant={d.billable ? "default" : "secondary"} className={d.billable ? "" : ""}>
                    {d.duration_minutes != null ? `${Math.round(d.duration_minutes)} min` : "Running"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{d.location}</div>
                <div className="mono text-[10px] text-muted-foreground mt-1">
                  {new Date(d.start_at).toLocaleString()} → {d.end_at ? new Date(d.end_at).toLocaleString() : "—"}
                </div>
                {d.billable && (
                  <div className="mt-1 text-[11px] text-primary mono flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Billable to broker
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

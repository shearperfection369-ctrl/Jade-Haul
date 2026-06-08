import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Timer, Play, Square, DollarSign } from "lucide-react";
import { toast } from "sonner";

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

  const refresh = async () => {
    const { data } = await api.get("/detention/list");
    setList(data);
    setActive(data.find((d) => !d.end_at) || null);
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
      <PageHeader title="Detention Timer" subtitle="Driver · Billable On-Site Time" />
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Truck, Activity, AlertTriangle, Gauge, MapPin, Radar, RefreshCw, ChevronRight, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import "leaflet/dist/leaflet.css";

const POLL_MS = 5000;

const statusTone = (s) => {
  if (s === "running") return "text-primary";
  if (s === "delivered") return "text-emerald-400";
  if (s === "stopped") return "text-muted-foreground";
  if (s === "error") return "text-destructive";
  return "text-primary";
};

const markerColor = (d) => {
  if (d.events_flagged > 0) return "#ef4444";  // red — flagged safety
  if (d.status === "delivered") return "#10b981"; // emerald — done
  if (d.alerts_open > 0) return "#eab308"; // yellow — attention
  return "hsl(var(--primary))";
};

export default function BrokerWatchPage() {
  const [data, setData] = useState({ kpis: null, drivers: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/broker/watch");
      setData(data);
      // Preserve selection if driver still present
      setSelected((prev) => data.drivers.find((d) => d.email === prev?.email) || prev);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Fit bounds around drivers
  const center = useMemo(() => {
    const pts = (data.drivers || []).filter((d) => d.lat && d.lng);
    if (!pts.length) return [34.5, -104];
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return [lat, lng];
  }, [data.drivers]);

  return (
    <div className="p-4 lg:p-6 space-y-4 h-full flex flex-col overflow-hidden" data-testid="broker-watch">
      <header className="flex items-center justify-between gap-4 flex-wrap shrink-0">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Broker · Control Tower</div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            Fleet Watch
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Every load across your carriers · live · updated every {POLL_MS / 1000}s</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} data-testid="watch-refresh">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 shrink-0" data-testid="watch-kpis">
        <Kpi icon={Truck} label="Active loads" value={data.kpis?.active_loads ?? "—"} />
        <Kpi icon={Radar} label="Watched"     value={data.kpis?.total_watched ?? "—"} />
        <Kpi icon={Activity} label="Events · 5m" value={data.kpis?.events_5m ?? "—"} />
        <Kpi icon={AlertTriangle} label="Alerts open" value={data.kpis?.alerts_open ?? "—"} />
        <Kpi icon={Gauge} label="Avg HOS eff" value={data.kpis?.avg_hos != null ? `${data.kpis.avg_hos}%` : "—"} glow />
        <Kpi icon={MapPin} label="Avg progress" value={data.kpis?.avg_progress != null ? `${data.kpis.avg_progress}%` : "—"} />
      </div>

      {/* Map + fleet ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 flex-1 min-h-0">
        {/* Map */}
        <Card className="jade-panel p-0 overflow-hidden relative" data-testid="watch-map">
          <div className="absolute top-2 left-2 z-[400] mono text-[10px] tracking-widest uppercase px-2 py-1 rounded bg-background/70 border border-primary/40 text-primary">
            LIVE · {data.drivers.length} carrier{data.drivers.length === 1 ? "" : "s"}
          </div>
          <MapContainer
            center={center}
            zoom={5}
            className="h-full min-h-[420px]"
            style={{ background: "#0a0f0e" }}
            key={data.drivers.length + "-map"}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap · CARTO"
            />
            {data.drivers.filter((d) => d.lat && d.lng).map((d) => {
              const color = markerColor(d);
              const isSel = selected?.email === d.email;
              return (
                <CircleMarker
                  key={d.sim_id || d.email}
                  center={[d.lat, d.lng]}
                  radius={isSel ? 12 : 9}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.75,
                    weight: isSel ? 3 : 2,
                  }}
                  eventHandlers={{ click: () => setSelected(d) }}
                >
                  <Popup>
                    <div className="text-xs">
                      <div className="font-semibold">{d.name}</div>
                      <div>{d.current_city}, {d.current_state}</div>
                      <div>{d.miles} / {d.total_mi} mi · {Math.round(d.progress * 100)}%</div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </Card>

        {/* Fleet ticker */}
        <Card className="jade-panel p-3 overflow-hidden flex flex-col" data-testid="watch-ticker">
          <div className="flex items-center justify-between px-2 pb-2 border-b border-border/40">
            <span className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Fleet ticker</span>
            {loading && <span className="mono text-[9px] tracking-widest text-primary uppercase">Refreshing…</span>}
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border/40" data-testid="watch-driver-list">
            {data.drivers.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm" data-testid="watch-empty">
                No carriers active right now. Trigger a sample simulation from the login page to seed activity.
              </div>
            ) : data.drivers.map((d) => {
              const sel = selected?.email === d.email;
              const pct = Math.round((d.progress || 0) * 100);
              return (
                <button
                  key={d.sim_id || d.email}
                  onClick={() => setSelected(d)}
                  className={`w-full text-left flex items-start gap-3 px-2 py-3 transition-colors ${sel ? "bg-primary/10" : "hover:bg-card/60"}`}
                  data-testid={`watch-row-${d.email}`}
                >
                  <div className="relative w-9 h-9 shrink-0 rounded-full flex items-center justify-center border" style={{ borderColor: markerColor(d), boxShadow: `0 0 12px ${markerColor(d)}55` }}>
                    <Truck className="w-4 h-4" style={{ color: markerColor(d) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{d.name}</span>
                      <Badge variant="outline" className={`mono text-[9px] uppercase tracking-widest ${statusTone(d.status)}`}>{d.status}</Badge>
                      {d.events_flagged > 0 && <Badge variant="outline" className="mono text-[9px] uppercase tracking-widest border-destructive/60 text-destructive"><ShieldAlert className="w-2.5 h-2.5 mr-0.5" /> {d.events_flagged} flagged</Badge>}
                    </div>
                    <div className="mono text-[10px] text-muted-foreground mt-0.5">
                      {d.current_city}, {d.current_state} · {d.miles}/{d.total_mi} mi · HOS {d.hos_efficiency}%
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5">
                      <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, background: markerColor(d), boxShadow: `0 0 6px ${markerColor(d)}` }} />
                    </div>
                    <div className="flex items-center gap-3 mono text-[10px] text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {d.events_recent} evt/5m</span>
                      <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {d.alerts_open} alerts</span>
                      <span className="flex items-center gap-1 ml-auto text-primary">{pct}% <ChevronRight className="w-3 h-3" /></span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, glow }) {
  return (
    <Card className={`jade-panel p-3 flex items-center gap-3 ${glow ? "border-primary/50 shadow-[0_0_18px_hsl(var(--primary)/0.2)]" : ""}`}>
      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">{label}</div>
        <div className="text-xl font-bold leading-none mt-0.5">{value}</div>
      </div>
    </Card>
  );
}

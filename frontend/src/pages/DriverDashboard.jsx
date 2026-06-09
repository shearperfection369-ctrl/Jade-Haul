import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import GpsMap from "@/components/GpsMap";
import JadeOrb from "@/components/JadeOrb";
import EldLogGrid from "@/components/EldLogGrid";
import AiCompanionBanner from "@/components/AiCompanionBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Clock, Fuel, Wrench, ShieldCheck, MapPin, Thermometer,
  Gauge, ArrowRight, Pause, Plug, ExternalLink
} from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const KpiCard = ({ icon: Icon, label, value, sub, accent, testid }) => (
  <div className="jade-panel p-5 flex flex-col gap-3" data-testid={testid}>
    <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <Icon className="w-3.5 h-3.5 text-primary" />
      {label}
    </div>
    <div className={`text-4xl font-extrabold ${accent ? "text-primary" : ""}`}>{value}</div>
    {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
  </div>
);

export default function DriverDashboard() {
  const nav = useNavigate();
  const { data: hos } = useSWR("/driver/hos", fetcher);
  const { data: load } = useSWR("/driver/active_load", fetcher);
  const { data: stations } = useSWR("/weigh-stations", fetcher);
  const { data: fleet } = useSWR("/fleet/health", fetcher);
  const { data: msgs } = useSWR("/messages", fetcher);
  const { data: widgets } = useSWR("/integrations", fetcher);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-5 pb-10">
      <AiCompanionBanner />
      <PageHeader
        subtitle="Driver · Command Deck"
        title={`On the road · ${load?.origin?.name || ""} → ${load?.destination?.name || ""}`}
        right={
          <div className="mono text-xs text-muted-foreground flex flex-col items-end">
            <span>{now.toLocaleTimeString("en-US", { hour12: false })}</span>
            <span className="text-[10px] tracking-[0.3em]">LOCAL TIME</span>
          </div>
        }
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard testid="kpi-drive-remaining" icon={Clock} label="Drive remaining" value={`${hos?.drive_remaining_hr ?? "—"}h`} sub="11-hr clock" accent />
        <KpiCard testid="kpi-cycle" icon={ShieldCheck} label="Cycle (70/8)" value={`${hos?.cycle_remaining_hr ?? "—"}h`} sub={hos?.compliance || "GREEN"} />
        <KpiCard testid="kpi-fuel" icon={Fuel} label="Fuel level" value={`${fleet?.fuel_pct ?? "—"}%`} sub={`MPG ${fleet?.mpg_7d ?? "—"} · idle ${fleet?.idle_hours_7d ?? "—"}h`} />
        <KpiCard testid="kpi-next-service" icon={Wrench} label="Next service" value={`${fleet?.next_service_in_miles?.toLocaleString() ?? "—"} mi`} sub={`${fleet?.alerts?.length || 0} alerts`} />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Map */}
        <div className="col-span-12 lg:col-span-7 h-[420px] jade-panel overflow-hidden p-0 jade-tracing-border">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Live Route</div>
              <div className="font-[Unbounded] text-base">{load?.origin?.name} → {load?.destination?.name}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => nav("/driver/gps")} data-testid="open-split-gps">
              Open Split View <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="h-[calc(100%-57px)]"><GpsMap load={load} stations={stations || []} animateDriver={false} /></div>
        </div>

        {/* JADE Orb */}
        <div className="col-span-12 lg:col-span-5 jade-panel p-5 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">JADE · AI Co-pilot</div>
              <div className="font-[Unbounded] text-base">She&apos;s listening for you</div>
            </div>
            <Badge variant="secondary" className="border-primary/40 text-primary">Claude Sonnet 4.5</Badge>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <JadeOrb state="idle" size={220} />
          </div>
          <div className="space-y-2 mt-2">
            <div className="text-sm text-muted-foreground leading-relaxed">
              &quot;You&apos;re 87 minutes from your federal break window. <span className="text-primary">Love&apos;s #423</span> is the cleanest stop ahead — 64 mi.&quot;
            </div>
            <Button className="w-full" onClick={() => nav("/driver/jade")} data-testid="jade-open-conversation">
              Open conversation
            </Button>
          </div>
        </div>

        {/* Load card */}
        <div className="col-span-12 lg:col-span-7 jade-panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Active Load</div>
              <div className="font-[Unbounded] text-lg">{load?.load_id}</div>
            </div>
            <Badge>{load?.commodity}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <div className="mono text-[10px] text-muted-foreground">Broker</div>
              <div className="text-sm font-medium">{load?.broker} · ★ {load?.broker_rating}</div>
            </div>
            <div>
              <div className="mono text-[10px] text-muted-foreground">Rate</div>
              <div className="text-sm font-medium text-primary">${load?.rate_usd?.toLocaleString()} · ${load?.rate_per_mile}/mi</div>
            </div>
            <div>
              <div className="mono text-[10px] text-muted-foreground">ETA</div>
              <div className="text-sm font-medium">{load?.eta && new Date(load.eta).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between mono text-[10px] text-muted-foreground mb-1">
              <span>{(load?.miles_total - load?.miles_remaining) || 0} mi</span>
              <span>{load?.miles_total} mi</span>
            </div>
            <Progress value={load ? ((load.miles_total - load.miles_remaining) / load.miles_total) * 100 : 0} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
            <div className="jade-glass px-3 py-2 flex items-center gap-2"><Thermometer className="w-3.5 h-3.5 text-primary" /> {load?.temperature_f}°F reefer</div>
            <div className="jade-glass px-3 py-2 flex items-center gap-2"><Gauge className="w-3.5 h-3.5 text-primary" /> {load?.weight_lbs?.toLocaleString()} lbs</div>
            <div className="jade-glass px-3 py-2 flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-primary" /> {load?.miles_remaining} mi left</div>
          </div>
        </div>

        {/* Alerts */}
        <div className="col-span-12 lg:col-span-5 jade-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Predictive Health</div>
              <div className="font-[Unbounded] text-base">Maintenance signals</div>
            </div>
            <Wrench className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-2">
            {(fleet?.alerts || []).map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60">
                <span className={`w-2 h-2 mt-1.5 rounded-full ${a.severity === "RED" ? "bg-destructive" : a.severity === "AMBER" ? "bg-amber-400" : "bg-primary"}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.detail}</div>
                  <div className="mono text-[10px] text-muted-foreground mt-1">▸ {a.eta_action}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Log */}
        <div className="col-span-12">
          <EldLogGrid events={hos?.log_events || []} />
        </div>

        {/* Connected widgets */}
        <div className="col-span-12 jade-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Mirrored Apps</div>
              <div className="font-[Unbounded] text-base flex items-center gap-2">
                Connected widgets
                <span className="mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--lime)", color: "#0a0f0e" }}>NEW</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => nav("/integrations")} data-testid="open-integrations">
              <Plug className="w-4 h-4 mr-1" /> Manage <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          {(!widgets || widgets.length === 0) ? (
            <div className="text-sm text-muted-foreground">
              Mirror any company app — Samsara, Motive, Geotab, McLeod, QuickBooks, Stripe, Drivewyze and more — directly inside Jade Haul.
              <Button variant="link" className="text-primary px-1" onClick={() => nav("/integrations")} data-testid="connect-first-widget">
                Connect your first widget →
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {widgets.slice(0, 8).map((w) => (
                <button
                  key={w.id}
                  onClick={() => nav(`/integrations/${w.id}`)}
                  className="p-3 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/70 hover:border-primary/50 transition-all text-left"
                  data-testid={`widget-tile-${w.slug}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold"
                      style={{ background: `${w.color}1A`, color: w.color, border: `1px solid ${w.color}55` }}>
                      {w.name[0]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{w.name}</div>
                      <div className="mono text-[10px] text-muted-foreground">{w.category}</div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages snippet */}
        <div className="col-span-12 jade-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Recent Comms</div>
              <div className="font-[Unbounded] text-base">Dispatch & Broker</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => nav("/driver/messages")} data-testid="open-messages">All <ArrowRight className="w-4 h-4 ml-1" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(msgs || []).map((m) => (
              <div key={m.id} className="p-3 rounded-lg bg-secondary/60">
                <div className="mono text-[10px] text-primary tracking-widest">{m.from}</div>
                <div className="text-sm mt-1.5 leading-relaxed">{m.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

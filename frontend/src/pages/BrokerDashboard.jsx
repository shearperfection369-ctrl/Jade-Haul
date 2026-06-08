import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, AlertTriangle, Users, Truck } from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid
} from "recharts";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function BrokerDashboard() {
  const { data } = useSWR("/broker/dashboard", fetcher);
  const { data: shipments } = useSWR("/broker/shipments", fetcher);
  if (!data) return null;

  const trend = data.revenue_trend_14d.map((v, i) => ({ d: `D-${13 - i}`, rev: v }));

  return (
    <div className="space-y-5">
      <PageHeader title="Broker Command Center" subtitle="Atlas Freight · Aria Chen" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Truck} label="Loads today" value={data.loads_today} testid="kpi-loads-today" />
        <Kpi icon={TrendingUp} label="Active quotes" value={data.active_quotes} testid="kpi-active-quotes" />
        <Kpi icon={DollarSign} label="MTD revenue" value={`$${(data.revenue_mtd_usd / 1000).toFixed(0)}k`} accent testid="kpi-revenue" />
        <Kpi icon={TrendingUp} label="Avg margin" value={`${data.avg_margin_pct}%`} testid="kpi-margin" />
        <Kpi icon={AlertTriangle} label="Exceptions" value={data.exception_count} alert testid="kpi-exceptions" />
      </div>

      <div className="grid grid-cols-12 gap-3">
        <Card className="jade-panel p-5 col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Revenue · 14 day</div>
              <div className="font-[Unbounded] text-base">Trend acceleration</div>
            </div>
            <Badge variant="outline" className="border-primary/40 text-primary mono">+18.2%</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="rev" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="jade-panel p-5 col-span-12 lg:col-span-4">
          <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Health</div>
          <div className="font-[Unbounded] text-base mb-3">Operational risk</div>
          <div className="space-y-3 text-sm">
            <Row label="On-time delivery" value={`${data.on_time_pct}%`} good />
            <Row label="Carriers at risk" value={data.carriers_at_risk} bad />
            <Row label="Shippers at risk" value={data.shippers_at_risk} bad />
            <Row label="Open exceptions" value={data.exception_count} bad />
          </div>
        </Card>

        <Card className="jade-panel p-5 col-span-12 lg:col-span-7">
          <div className="font-[Unbounded] text-base mb-2">Top lanes</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_lanes}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="lane" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="jade-panel p-5 col-span-12 lg:col-span-5">
          <div className="font-[Unbounded] text-base mb-2">Live shipments</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(shipments || []).map((s) => (
              <div key={s.id} className="p-3 rounded-lg bg-secondary/60">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{s.shipper}</div>
                  <Badge variant={s.status === "DELIVERED" ? "default" : "outline"} className={s.status === "IN_TRANSIT" ? "border-primary/40 text-primary" : ""}>
                    {s.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{s.lane} · {s.carrier}</div>
                <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${s.progress_pct}%`, boxShadow: "0 0 8px hsl(var(--primary))" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent, alert, testid }) {
  return (
    <div className="jade-panel p-5" data-testid={testid}>
      <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${alert ? "text-destructive" : "text-primary"}`} /> {label}
      </div>
      <div className={`text-3xl font-extrabold mt-2 ${accent ? "text-primary" : ""} ${alert ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, good, bad }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`mono font-bold ${good ? "text-primary" : bad ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

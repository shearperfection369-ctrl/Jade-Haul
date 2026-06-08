import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Trophy } from "lucide-react";
import {
  RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, Tooltip
} from "recharts";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function SafetyPage() {
  const { data } = useSWR("/safety/scorecard", fetcher);
  if (!data) return null;
  const radial = [{ name: "Score", value: data.overall, fill: "hsl(var(--primary))" }];
  const trend = data.trend_7d.map((v, i) => ({ d: `D-${6 - i}`, score: v }));

  return (
    <div>
      <PageHeader title="Safety Scorecard" subtitle="Driver · AI Coaching" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="jade-panel p-5 jade-tracing-border">
          <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" /> Overall
          </div>
          <div className="h-56 mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={radial} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={20} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-5xl font-extrabold mono text-primary">{data.overall}</div>
              <div className="mono text-[10px] text-muted-foreground">out of 100</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs mt-2">
            <span className="mono text-muted-foreground">Rank</span>
            <span className="text-primary mono"><Trophy className="w-3 h-3 inline mr-1" /> #{data.rank} of {data.fleet_size}</span>
          </div>
        </Card>

        <Card className="jade-panel p-5 lg:col-span-2">
          <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">7-day trend</div>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <XAxis dataKey="d" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis domain={[80, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="jade-panel p-5 lg:col-span-3">
          <div className="font-[Unbounded] text-base mb-3">Category breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(data.categories).map(([k, v]) => (
              <div key={k} className="p-3 rounded-lg bg-secondary/60">
                <div className="flex items-center justify-between">
                  <div className="text-sm capitalize">{k.replace(/_/g, " ")}</div>
                  <Badge variant="outline" className="border-primary/40 text-primary mono">{v}</Badge>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-background overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${v}%`, boxShadow: "0 0 8px hsl(var(--primary))" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Rewards balance · <span className="text-primary mono">${data.rewards_balance_usd.toFixed(2)}</span> · 0 incidents in last 30 days.
          </div>
        </Card>
      </div>
    </div>
  );
}

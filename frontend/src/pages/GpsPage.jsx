import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import GpsMap from "@/components/GpsMap";
import EldLogGrid from "@/components/EldLogGrid";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation, ArrowUpRight, Wind, MapPin } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

const TURNS = [
  { in_mi: 0.6, text: "Take exit 247B toward I-10 W" },
  { in_mi: 14.2, text: "Continue straight 132 mi" },
  { in_mi: 138.0, text: "Pull in — Quartzsite Port of Entry" },
  { in_mi: 211.0, text: "Bypass — Yuma West Scale" },
  { in_mi: 612.0, text: "Arrive Phoenix DC · 4400 W Buckeye Rd" },
];

export default function GpsPage() {
  const { data: load } = useSWR("/driver/active_load", fetcher);
  const { data: stations } = useSWR("/weigh-stations", fetcher);
  const { data: hos } = useSWR("/driver/hos", fetcher);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Split Cockpit · GPS & ELD"
        subtitle="Driver · Live Operations"
        right={<Badge variant="secondary" className="border-primary/40 text-primary">Half-screen GPS · Half-screen Log</Badge>}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        {/* GPS */}
        <div className="jade-panel p-0 overflow-hidden flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
            <div>
              <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">3D HUD Map</div>
              <div className="font-[Unbounded] text-base">{load?.origin?.name} → {load?.destination?.name}</div>
            </div>
            <Badge variant="outline" className="border-primary/40 text-primary mono text-[10px]">
              ETA {load?.eta && new Date(load.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Badge>
          </div>
          <div className="relative flex-1">
            <GpsMap load={load} stations={stations || []} tilt3d />
          </div>
          {/* Turn-by-turn ribbon */}
          <div className="border-t border-border/70 p-3 bg-card/60">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-[Unbounded] text-sm leading-tight">{TURNS[0].text}</div>
                <div className="mono text-[10px] text-muted-foreground">in {TURNS[0].in_mi} mi · continue 132 mi</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold text-primary mono">{TURNS[0].in_mi}<span className="text-xs"> mi</span></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] mono">
              {TURNS.slice(1, 5).map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60">
                  <ArrowUpRight className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">+{t.in_mi}mi</span>
                  <span className="truncate text-foreground/80">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Driver log */}
        <div className="space-y-3 flex flex-col min-h-0">
          <div className="grid grid-cols-3 gap-3">
            <Card className="jade-panel p-4">
              <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">Drive remaining</div>
              <div className="text-3xl font-extrabold text-primary mono mt-1">{hos?.drive_remaining_hr}h</div>
            </Card>
            <Card className="jade-panel p-4">
              <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">On-duty remaining</div>
              <div className="text-3xl font-extrabold mono mt-1">{hos?.on_duty_remaining_hr}h</div>
            </Card>
            <Card className="jade-panel p-4">
              <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">Cycle 70/8</div>
              <div className="text-3xl font-extrabold mono mt-1">{hos?.cycle_remaining_hr}h</div>
            </Card>
          </div>
          <EldLogGrid events={hos?.log_events || []} />
          <Card className="jade-panel p-4 flex-1">
            <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">Conditions ahead</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 rounded-lg bg-secondary/60">
                <div className="flex items-center gap-2 text-sm"><Wind className="w-4 h-4 text-primary" /> Crosswind 18 mph</div>
                <div className="text-xs text-muted-foreground mt-1">Watch high-profile load handling.</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/60">
                <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-primary" /> 2 bypasses · 1 pull-in</div>
                <div className="text-xs text-muted-foreground mt-1">Next scale: Quartzsite POE</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

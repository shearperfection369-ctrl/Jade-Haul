import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, CheckCircle, XCircle } from "lucide-react";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function WeighStationsPage() {
  const { data } = useSWR("/weigh-stations", fetcher);
  return (
    <div>
      <PageHeader title="Weigh Station Bypass" subtitle="Driver · Drivewyze-style certs" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(data || []).map((s) => {
          const bypass = s.status === "BYPASS";
          return (
            <Card key={s.id} className={`jade-panel p-5 ${bypass ? "jade-tracing-border" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="font-[Unbounded] text-base">{s.name}</div>
                <Badge variant={bypass ? "default" : "destructive"} className={bypass ? "bg-primary text-primary-foreground" : ""}>
                  {bypass ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                  {bypass ? "Green-Light Bypass" : "Pull-In Required"}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                <Cell label="Miles ahead" v={`${s.miles_ahead} mi`} />
                <Cell label="Lane" v={s.lane} />
                <Cell label="Score" v={`${s.score}/100`} accent />
              </div>
              {s.reason && (
                <div className="mt-3 text-xs text-muted-foreground border-t border-border/60 pt-3">
                  <span className="mono text-[10px] uppercase tracking-widest text-destructive">Reason · </span>
                  {s.reason}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground mono">
                <Gauge className="w-3 h-3 text-primary" /> Threshold {s.weight_threshold.toLocaleString()} lbs
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ label, v, accent }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/60">
      <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">{label}</div>
      <div className={`text-sm font-medium mt-1 ${accent ? "text-primary mono" : ""}`}>{v}</div>
    </div>
  );
}

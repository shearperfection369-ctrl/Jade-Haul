import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import EldLogGrid from "@/components/EldLogGrid";
import { Card } from "@/components/ui/card";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function EldLogsPage() {
  const { data: hos } = useSWR("/driver/hos", fetcher);
  if (!hos) return null;
  return (
    <div>
      <PageHeader title="ELD · Hours of Service" subtitle="Driver · Compliance" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
        {[
          ["Drive remaining", `${hos.drive_remaining_hr}h`, "of 11"],
          ["On-duty remaining", `${hos.on_duty_remaining_hr}h`, "of 14"],
          ["Cycle remaining", `${hos.cycle_remaining_hr}h`, "70/8 rolling"],
          ["Next break", `${hos.next_break_in_min}m`, "federal 30-min"],
        ].map(([l, v, s]) => (
          <Card key={l} className="jade-panel p-5">
            <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">{l}</div>
            <div className="text-4xl font-extrabold mt-1 text-primary mono">{v}</div>
            <div className="text-xs text-muted-foreground">{s}</div>
          </Card>
        ))}
      </div>
      <EldLogGrid events={hos.log_events} />
      <Card className="jade-panel p-5 mt-3">
        <div className="font-[Unbounded] text-base mb-3">Event timeline</div>
        <div className="space-y-2">
          {hos.log_events.map((e, i) => (
            <div key={i} className="flex items-center gap-4 text-sm font-mono">
              <span className="text-muted-foreground">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="text-primary">▸</span>
              <span>{e.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

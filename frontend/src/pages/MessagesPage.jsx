import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function MessagesPage() {
  const { data } = useSWR("/messages", fetcher);
  return (
    <div>
      <PageHeader title="Comms Hub" subtitle="Driver · Dispatch / Broker / JADE" />
      <div className="space-y-3 max-w-3xl">
        {(data || []).map((m) => (
          <Card key={m.id} className="jade-panel p-4">
            <div className="flex items-center justify-between">
              <div className="mono text-[11px] tracking-widest text-primary">{m.from}</div>
              <div className="mono text-[10px] text-muted-foreground">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div className="text-sm mt-2 leading-relaxed">{m.body}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

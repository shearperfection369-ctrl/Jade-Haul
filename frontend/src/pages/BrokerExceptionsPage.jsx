import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function BrokerExceptionsPage() {
  const { data } = useSWR("/broker/exceptions", fetcher);
  return (
    <div>
      <PageHeader title="Exception Queue" subtitle="Broker · AI Resolution" />
      <div className="space-y-3">
        {(data || []).map((e) => (
          <Card key={e.id} className="jade-panel p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`w-5 h-5 ${e.severity === "HIGH" ? "text-destructive" : e.severity === "MEDIUM" ? "text-amber-400" : "text-primary"}`} />
                <div>
                  <div className="font-[Unbounded] text-base">{e.type.replace("_", " ")}</div>
                  <div className="text-xs text-muted-foreground">Load {e.load_id} · {e.carrier}</div>
                </div>
              </div>
              <Badge
                className={
                  e.severity === "HIGH" ? "bg-destructive text-destructive-foreground" :
                  e.severity === "MEDIUM" ? "bg-amber-500/80 text-black" :
                  "bg-primary text-primary-foreground"
                }
              >
                {e.severity}
              </Badge>
            </div>
            <div className="text-sm mt-3">{e.detail}</div>
            <div className="mt-3 p-3 rounded-lg bg-secondary/60 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-primary mt-0.5" />
              <div className="flex-1 text-sm">
                <span className="mono text-[10px] uppercase tracking-widest text-primary mr-2">JADE AI</span>
                {e.ai_suggestion}
              </div>
              <Button size="sm" onClick={() => toast.success("Resolution applied")} data-testid={`apply-${e.id}`}>Apply</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

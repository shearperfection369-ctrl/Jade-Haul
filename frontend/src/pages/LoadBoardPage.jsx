import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Star } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function LoadBoardPage() {
  const { data } = useSWR("/loads", fetcher);
  return (
    <div>
      <PageHeader title="Load Board" subtitle="Driver · Freight Matching" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data || []).map((l) => (
          <Card key={l.id} className="jade-panel p-5 hover:jade-ring-glow transition-shadow">
            <div className="flex items-center justify-between">
              <div className="font-[Unbounded] text-base">{l.origin} → {l.destination}</div>
              <Badge variant="outline" className="border-primary/40 text-primary mono">{l.id}</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
              <span><Truck className="w-3 h-3 inline mr-1" /> {l.equipment}</span>
              <span>{l.pickup}</span>
              <span>{l.weight.toLocaleString()} lbs</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="p-3 rounded-lg bg-secondary/60">
                <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">Rate</div>
                <div className="text-lg font-extrabold text-primary mono">${l.rate.toLocaleString()}</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/60">
                <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">$/mi</div>
                <div className="text-lg font-extrabold mono">${l.rpm.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/60">
                <div className="mono text-[10px] text-muted-foreground uppercase tracking-widest">Miles</div>
                <div className="text-lg font-extrabold mono">{l.miles}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm">{l.broker} · <Star className="w-3 h-3 inline text-primary -translate-y-px" /> {l.broker_rating}</div>
              <Button data-testid={`accept-${l.id}`} onClick={() => toast.success(`Booked ${l.id}`)}>Accept load</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { DollarSign, CheckCircle2, Clock, CreditCard, Calculator } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url) => api.get(url).then((r) => r.data);

export default function SettlementsPage() {
  const { user } = useAuth();
  const { data } = useSWR("/settlements", fetcher);
  if (!data) return null;
  const isDriver = user?.role === "driver";

  return (
    <div className="space-y-5">
      <PageHeader
        title={isDriver ? "Driver Pay · Settlements" : "Payouts · Settlements"}
        subtitle="Jade Haul · Stripe + QuickBooks"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label={isDriver ? "Outstanding" : "Scheduled"} value={`$${data.totals.outstanding_usd.toFixed(2)}`} icon={Clock} />
        <Stat label="Paid · 30d" value={`$${data.totals.paid_30d_usd.toFixed(2)}`} icon={CheckCircle2} accent />
        <div className="jade-panel p-5">
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Connections</div>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 flex items-center gap-2 p-3 rounded-lg bg-secondary/60">
              <CreditCard className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">Stripe</div>
                <Badge variant={data.connections.stripe ? "default" : "outline"} className={data.connections.stripe ? "" : "text-muted-foreground"}>
                  {data.connections.stripe ? "Connected" : "Not connected"}
                </Badge>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2 p-3 rounded-lg bg-secondary/60">
              <Calculator className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">QuickBooks</div>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => toast("Open QuickBooks OAuth flow")} data-testid="connect-quickbooks">
                  Connect
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">{isDriver ? "Recent settlements" : "Outbound payouts"}</div>
        <div className="space-y-2">
          {data.items.map((s) => (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-[120px_140px_1fr_120px_120px_120px] gap-3 items-center p-3 rounded-lg bg-secondary/60" data-testid={`settlement-${s.id}`}>
              <div className="mono text-[11px] text-primary">{s.id}</div>
              <div className="mono text-[11px] text-muted-foreground">{s.load_id}</div>
              <div className="text-sm">{isDriver ? s.broker : s.carrier}</div>
              <div className="mono text-sm font-bold text-primary">${s.amount_usd.toLocaleString()}</div>
              <div className="mono text-[11px] text-muted-foreground">{s.method}</div>
              <Badge className={s.status === "PAID" ? "bg-primary text-primary-foreground" : "bg-amber-500/80 text-black"}>
                {s.status}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="jade-panel p-5">
      <div className="flex items-center gap-2 mono text-[10px] uppercase text-muted-foreground tracking-widest">
        <Icon className="w-3.5 h-3.5 text-primary" /> {label}
      </div>
      <div className={`text-4xl font-extrabold mt-2 mono ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

import React, { useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";

export default function BrokerQuotePage() {
  const [form, setForm] = useState({
    origin: "Dallas, TX",
    destination: "Phoenix, AZ",
    miles: 1067,
    weight_lbs: 38400,
    equipment: "Reefer",
    pickup_date: "2026-02-11",
    hazmat: false,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const optimize = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/broker/quote/optimize", { ...form, miles: Number(form.miles), weight_lbs: Number(form.weight_lbs) });
      setResult(data);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <PageHeader title="Quote Optimizer" subtitle="Broker · AI Margin Coach" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-3">Lane parameters</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Origin", "origin"], ["Destination", "destination"],
              ["Miles", "miles"], ["Weight (lbs)", "weight_lbs"],
              ["Equipment", "equipment"], ["Pickup date", "pickup_date"],
            ].map(([label, key]) => (
              <div key={key}>
                <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
                <Input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`quote-${key}`} />
              </div>
            ))}
            <div className="col-span-2 flex items-center gap-3 mt-1">
              <Switch checked={form.hazmat} onCheckedChange={(v) => setForm({ ...form, hazmat: v })} data-testid="quote-hazmat" />
              <Label className="text-sm">Hazmat load</Label>
            </div>
          </div>
          <Button className="w-full mt-4 h-11" onClick={optimize} disabled={loading} data-testid="quote-optimize-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Optimize with JADE
          </Button>
        </Card>

        <Card className="jade-panel p-5 min-h-[420px]">
          {!result && <div className="text-sm text-muted-foreground">Run the optimizer to see the recommended rate, win probability, and best-fit carriers.</div>}
          {result && (
            <div className="space-y-4" data-testid="quote-result">
              <div>
                <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Lane</div>
                <div className="font-[Unbounded] text-lg">{result.lane}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Suggested rate" value={`$${result.suggested_rate_usd.toLocaleString()}`} primary />
                <Stat label="Suggested $/mi" value={`$${result.suggested_rpm}`} primary />
                <Stat label="Floor rate" value={`$${result.floor_rate_usd.toLocaleString()}`} />
                <Stat label="Win probability" value={`${Math.round(result.win_probability * 100)}%`} />
                <Stat label="Target margin" value={`${result.target_margin_pct}%`} />
                <Stat label="Miles" value={result.miles} />
              </div>
              <div>
                <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest mb-1">Best carriers</div>
                <div className="space-y-2">
                  {result.best_carriers.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/60">
                      <div className="text-sm">{c.name}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-primary/40 text-primary mono">{c.score}</Badge>
                        <Badge variant={c.available_now ? "default" : "secondary"}>{c.available_now ? "Available" : "Booked"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest mb-1">Rationale</div>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  {result.rationale.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, primary }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/60">
      <div className="mono text-[10px] uppercase text-muted-foreground tracking-widest">{label}</div>
      <div className={`text-lg font-extrabold mt-1 ${primary ? "text-primary" : ""} mono`}>{value}</div>
    </div>
  );
}

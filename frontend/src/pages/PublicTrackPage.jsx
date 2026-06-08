import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import JadeMark from "@/components/JadeMark";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MapPin, Truck, Thermometer, Calendar, Clock } from "lucide-react";

const BASE = process.env.REACT_APP_BACKEND_URL;

export default function PublicTrackPage() {
  const { loadId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    axios.get(`${BASE}/api/track/${loadId}`)
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.message));
  }, [loadId]);

  if (err) return <div className="min-h-screen flex items-center justify-center text-destructive">Tracking unavailable: {err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading shipment…</div>;

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <JadeMark size="md" subtitle="Public Shipment Tracking" />
          <Badge variant="outline" className="border-primary/40 text-primary mono">
            {data.status.replace("_", " ")}
          </Badge>
        </div>

        <Card className="jade-panel p-6 jade-tracing-border">
          <div className="mono text-[10px] uppercase tracking-widest text-primary">Load · {data.load_id}</div>
          <div className="font-[Unbounded] text-3xl mt-1">{data.origin} → {data.destination}</div>
          <div className="text-sm text-muted-foreground mt-1">Carrier: {data.carrier} · {data.carrier_dot}</div>

          <div className="mt-5">
            <div className="flex justify-between mono text-[11px] text-muted-foreground mb-1">
              <span>Pickup</span>
              <span>{data.progress_pct}% complete</span>
              <span>Delivery</span>
            </div>
            <Progress value={data.progress_pct} className="h-2" />
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {data.current_location}</span>
              <span className="mono text-primary">{data.miles_remaining} mi left</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <Cell icon={Truck} label="Shipper" v={data.shipper} />
            <Cell icon={MapPin} label="Consignee" v={data.consignee} />
            <Cell icon={Thermometer} label="Reefer" v={`${data.temperature_f}°F`} />
            <Cell icon={Clock} label="ETA" v={new Date(data.eta).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} accent />
          </div>
        </Card>

        <Card className="jade-panel p-5">
          <div className="font-[Unbounded] text-base mb-4">Timeline</div>
          <div className="relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
            {data.events.map((e, i) => (
              <div key={i} className="flex items-start gap-4 mb-4 relative">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 relative z-10">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="mono text-[11px] text-primary tracking-widest">{e.kind}</div>
                  <div className="text-sm mt-0.5">{e.label}</div>
                  <div className="mono text-[10px] text-muted-foreground mt-0.5">
                    {new Date(e.t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="text-center text-[11px] text-muted-foreground mono tracking-widest">
          POWERED BY JADE HAUL · A JADEOS PRODUCT
        </div>
      </div>
    </div>
  );
}

function Cell({ icon: Icon, label, v, accent }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/60">
      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-primary" /> {label}
      </div>
      <div className={`text-sm mt-1 ${accent ? "text-primary font-bold mono" : ""}`}>{v}</div>
    </div>
  );
}

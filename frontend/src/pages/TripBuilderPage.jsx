import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, MapPin, Trash2, Route as RouteIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

const blankStop = (kind = "stop") => ({ name: "", lat: 0, lng: 0, kind, eta_offset_hr: 0 });

export default function TripBuilderPage() {
  const [trips, setTrips] = useState([]);
  const [form, setForm] = useState({
    name: "DAL → PHX · Reefer",
    origin: { ...blankStop("pickup"), name: "Dallas, TX", lat: 32.7767, lng: -96.797 },
    destination: { ...blankStop("dropoff"), name: "Phoenix, AZ", lat: 33.4484, lng: -112.074 },
    stops: [{ ...blankStop("fuel"), name: "Abilene Truck Plaza", lat: 32.4487, lng: -99.7331 }],
    commodity: "Refrigerated produce",
    weight_lbs: 38400,
    hazmat: false,
    notes: "",
    planned_start: new Date().toISOString().slice(0, 16),
  });

  const refresh = async () => {
    const { data } = await api.get("/trips");
    setTrips(data);
  };
  useEffect(() => { refresh(); }, []);

  const updStop = (idx, patch) => {
    const stops = [...form.stops];
    stops[idx] = { ...stops[idx], ...patch };
    setForm({ ...form, stops });
  };
  const addStop = () => setForm({ ...form, stops: [...form.stops, blankStop("rest")] });
  const rmStop = (idx) => setForm({ ...form, stops: form.stops.filter((_, i) => i !== idx) });

  const save = async () => {
    try {
      await api.post("/trips", {
        ...form,
        weight_lbs: Number(form.weight_lbs) || 0,
        origin: { ...form.origin, lat: Number(form.origin.lat), lng: Number(form.origin.lng) },
        destination: { ...form.destination, lat: Number(form.destination.lat), lng: Number(form.destination.lng) },
        stops: form.stops.map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) })),
      });
      toast.success("Trip plan saved — Jade is on it");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  const setStatus = async (id, status) => {
    await api.patch(`/trips/${id}/status?status=${status}`);
    refresh();
  };

  const del = async (id) => {
    await api.delete(`/trips/${id}`);
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trip Builder · Plan your day"
        subtitle="Driver · Manual + AI-assisted route"
        right={<Badge variant="outline" className="border-primary/40 text-primary mono">{trips.length} saved</Badge>}
      />

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2">
          <RouteIcon className="w-4 h-4 text-primary" /> New trip plan
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Trip name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="trip-name" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Commodity</Label>
            <Input value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} data-testid="trip-commodity" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Weight (lbs)</Label>
            <Input type="number" value={form.weight_lbs} onChange={(e) => setForm({ ...form, weight_lbs: e.target.value })} data-testid="trip-weight" />
          </div>
        </div>

        <Section label="Origin · Pickup">
          <StopFields s={form.origin} on={(p) => setForm({ ...form, origin: { ...form.origin, ...p } })} prefix="origin" />
        </Section>

        <Section label="Destination · Drop">
          <StopFields s={form.destination} on={(p) => setForm({ ...form, destination: { ...form.destination, ...p } })} prefix="dest" />
        </Section>

        <Section label="Intermediate stops">
          <div className="space-y-3">
            {form.stops.map((s, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px_40px] gap-2 items-end p-2 rounded-lg bg-secondary/40">
                <div>
                  <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</Label>
                  <Input value={s.name} onChange={(e) => updStop(i, { name: e.target.value })} data-testid={`stop-name-${i}`} />
                </div>
                <div>
                  <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Kind</Label>
                  <Input value={s.kind} onChange={(e) => updStop(i, { kind: e.target.value })} placeholder="fuel/rest" />
                </div>
                <div>
                  <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Lat</Label>
                  <Input value={s.lat} onChange={(e) => updStop(i, { lat: e.target.value })} />
                </div>
                <div>
                  <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Lng</Label>
                  <Input value={s.lng} onChange={(e) => updStop(i, { lng: e.target.value })} />
                </div>
                <Button variant="ghost" size="icon" onClick={() => rmStop(i)} data-testid={`stop-del-${i}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={addStop} data-testid="stop-add"><Plus className="w-4 h-4 mr-2" /> Add stop</Button>
          </div>
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Planned start</Label>
            <Input type="datetime-local" value={form.planned_start} onChange={(e) => setForm({ ...form, planned_start: e.target.value })} data-testid="trip-start" />
          </div>
          <div className="flex items-center gap-3 mt-6">
            <Switch checked={form.hazmat} onCheckedChange={(v) => setForm({ ...form, hazmat: v })} data-testid="trip-hazmat" />
            <Label className="text-sm">Hazmat</Label>
          </div>
          <Button onClick={save} className="h-10 mt-5" data-testid="trip-save">
            <Sparkles className="w-4 h-4 mr-2" /> Save & let Jade plan
          </Button>
        </div>
      </Card>

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">Your trips</div>
        <div className="space-y-2">
          {trips.length === 0 && <div className="text-sm text-muted-foreground">No trips yet — build your first one above.</div>}
          {trips.map((t) => (
            <div key={t.id} className="p-3 rounded-lg bg-secondary/60 flex items-center gap-3" data-testid={`trip-row-${t.id}`}>
              <MapPin className="w-4 h-4 text-primary" />
              <div className="flex-1">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="mono text-[11px] text-muted-foreground">
                  {t.origin?.name} → {t.destination?.name} · {t.stops?.length || 0} stops
                </div>
              </div>
              <Badge variant="outline" className="mono">{t.status}</Badge>
              {t.status === "PLANNED" && (
                <Button size="sm" onClick={() => setStatus(t.id, "IN_PROGRESS")} data-testid={`trip-start-${t.id}`}>Start</Button>
              )}
              {t.status === "IN_PROGRESS" && (
                <Button size="sm" onClick={() => setStatus(t.id, "DELIVERED")} data-testid={`trip-deliver-${t.id}`}>Mark delivered</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => del(t.id)} data-testid={`trip-del-${t.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="mt-4">
      <div className="mono text-[10px] uppercase tracking-widest text-primary mb-2">{label}</div>
      {children}
    </div>
  );
}

function StopFields({ s, on, prefix }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Input value={s.name} onChange={(e) => on({ name: e.target.value })} placeholder="Name" data-testid={`${prefix}-name`} />
      <Input value={s.lat} onChange={(e) => on({ lat: e.target.value })} placeholder="Latitude" data-testid={`${prefix}-lat`} />
      <Input value={s.lng} onChange={(e) => on({ lng: e.target.value })} placeholder="Longitude" data-testid={`${prefix}-lng`} />
    </div>
  );
}

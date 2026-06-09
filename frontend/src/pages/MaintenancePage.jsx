import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Wrench, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const CATS = ["OIL", "TIRES", "BRAKES", "DEF", "TRANSMISSION", "INSPECTION", "OTHER"];

export default function MaintenancePage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    vehicle: "Unit RIG-77", category: "OIL", title: "", detail: "",
    odometer_mi: 0, severity: "GREEN", due_in_miles: 0, cost_usd: 0, completed: false,
  });

  const refresh = async () => {
    try {
      const { data } = await api.get("/maintenance");
      setItems(data);
    } catch (e) {
      console.warn("maintenance refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);

  const add = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    await api.post("/maintenance", {
      ...form,
      odometer_mi: Number(form.odometer_mi) || 0,
      due_in_miles: Number(form.due_in_miles) || 0,
      cost_usd: Number(form.cost_usd) || 0,
    });
    toast.success("Maintenance entry logged");
    setForm({ ...form, title: "", detail: "", cost_usd: 0 });
    refresh();
  };

  const toggleDone = async (it) => {
    await api.patch(`/maintenance/${it.id}`, { completed: !it.completed });
    refresh();
  };

  const del = async (id) => {
    await api.delete(`/maintenance/${id}`);
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Maintenance · Manual + AI tracked" subtitle="Driver · Vehicle health ledger" />

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" /> Add maintenance entry
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Vehicle</Label>
            <Input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} data-testid="mx-vehicle" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="mx-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Drive axle L tire — low PSI" data-testid="mx-title" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Severity</Label>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger data-testid="mx-sev"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GREEN">GREEN</SelectItem>
                <SelectItem value="AMBER">AMBER</SelectItem>
                <SelectItem value="RED">RED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Detail</Label>
            <Input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Drop of 6 PSI over 12 hr…" data-testid="mx-detail" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Odometer (mi)</Label>
            <Input type="number" value={form.odometer_mi} onChange={(e) => setForm({ ...form, odometer_mi: e.target.value })} data-testid="mx-odo" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Due in (mi)</Label>
            <Input type="number" value={form.due_in_miles} onChange={(e) => setForm({ ...form, due_in_miles: e.target.value })} data-testid="mx-due" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Cost ($)</Label>
            <Input type="number" value={form.cost_usd} onChange={(e) => setForm({ ...form, cost_usd: e.target.value })} data-testid="mx-cost" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.completed} onCheckedChange={(v) => setForm({ ...form, completed: v })} data-testid="mx-completed" />
            <Label className="text-sm">Completed</Label>
          </div>
          <Button onClick={add} className="md:col-span-2 h-10" data-testid="mx-add"><Plus className="w-4 h-4 mr-2" /> Add entry</Button>
        </div>
      </Card>

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">Ledger</div>
        <div className="space-y-2">
          {items.length === 0 && <div className="text-sm text-muted-foreground">No maintenance entries yet.</div>}
          {items.map((it) => (
            <div key={it.id} className="p-3 rounded-lg bg-secondary/60 flex items-start gap-3" data-testid={`mx-row-${it.id}`}>
              <span className={`w-2 h-2 rounded-full mt-2 ${it.severity === "RED" ? "bg-destructive" : it.severity === "AMBER" ? "bg-amber-400" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="border-primary/40 text-primary mono">{it.category}</Badge>
                  <div className="text-sm font-medium">{it.title}</div>
                  {it.completed && <Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{it.detail}</div>
                <div className="mono text-[10px] text-muted-foreground mt-1">
                  {it.vehicle} · odo {it.odometer_mi?.toLocaleString?.() || it.odometer_mi} mi · due in {it.due_in_miles || 0} mi · ${it.cost_usd?.toFixed?.(2) ?? "0.00"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toggleDone(it)} data-testid={`mx-toggle-${it.id}`}>
                <CheckCircle2 className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => del(it.id)} data-testid={`mx-del-${it.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

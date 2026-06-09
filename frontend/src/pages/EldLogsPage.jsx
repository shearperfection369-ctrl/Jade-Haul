import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import EldLogGrid from "@/components/EldLogGrid";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["OFF_DUTY", "SLEEPER", "DRIVING", "ON_DUTY"];

export default function EldLogsPage() {
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState({ status: "DRIVING", t: new Date().toISOString().slice(0, 16), location: "", notes: "" });
  const [editingId, setEditingId] = useState(null);

  const refresh = async () => {
    try {
      const { data } = await api.get("/eld/events");
      setEvents(data);
    } catch (e) {
      console.warn("eld refresh failed:", e?.message || e);
    }
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    try {
      const t = new Date(draft.t).toISOString();
      if (editingId) {
        await api.patch(`/eld/events/${editingId}`, { ...draft, t });
        toast.success("Event updated");
      } else {
        await api.post("/eld/events", { ...draft, t });
        toast.success("Event logged");
      }
      setDraft({ status: "DRIVING", t: new Date().toISOString().slice(0, 16), location: "", notes: "" });
      setEditingId(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save");
    }
  };

  const remove = async (id) => {
    await api.delete(`/eld/events/${id}`);
    toast.success("Removed");
    refresh();
  };

  const edit = (e) => {
    setEditingId(e.id);
    setDraft({
      status: e.status,
      t: new Date(e.t).toISOString().slice(0, 16),
      location: e.location || "",
      notes: e.notes || "",
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title="ELD Logs · Editable" subtitle="Driver · Manual + AI-assisted day plan"
        right={<Badge variant="outline" className="border-primary/40 text-primary mono">{events.length} events</Badge>} />

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">{editingId ? "Edit event" : "Add ELD event"}</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Status</Label>
            <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}>
              <SelectTrigger data-testid="eld-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">When</Label>
            <Input type="datetime-local" value={draft.t} onChange={(e) => setDraft({ ...draft, t: e.target.value })} data-testid="eld-when" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Location</Label>
            <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Quartzsite, AZ" data-testid="eld-location" />
          </div>
          <div>
            <Label className="mono text-[10px] uppercase text-muted-foreground tracking-widest">Notes</Label>
            <Input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" data-testid="eld-notes" />
          </div>
          <Button onClick={save} className="h-10" data-testid="eld-save">
            {editingId ? <><Save className="w-4 h-4 mr-2" /> Update</> : <><Plus className="w-4 h-4 mr-2" /> Add</>}
          </Button>
        </div>
      </Card>

      <EldLogGrid events={events.length ? events : [{ t: new Date().toISOString(), status: "OFF_DUTY" }]} />

      <Card className="jade-panel p-5">
        <div className="font-[Unbounded] text-base mb-3">Event log · click ✏ to edit</div>
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {events.length === 0 && (
            <div className="text-sm text-muted-foreground">No events yet — add your first status change above.</div>
          )}
          {events.map((e) => (
            <div key={e.id} className="grid grid-cols-1 md:grid-cols-[140px_180px_1fr_120px] gap-3 items-center p-3 rounded-lg bg-secondary/60" data-testid={`eld-row-${e.id}`}>
              <Badge variant="outline" className="border-primary/40 text-primary mono">{e.status.replace("_", " ")}</Badge>
              <div className="mono text-xs text-muted-foreground">{new Date(e.t).toLocaleString()}</div>
              <div className="text-sm">{e.location || "—"} <span className="text-muted-foreground text-xs">{e.notes ? `· ${e.notes}` : ""}</span></div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => edit(e)} data-testid={`eld-edit-${e.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => remove(e.id)} data-testid={`eld-del-${e.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

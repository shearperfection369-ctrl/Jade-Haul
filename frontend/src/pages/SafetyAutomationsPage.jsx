import React, { useEffect, useState, useCallback } from "react";
import { Bot, Plus, Trash2, Power, Save, Wand2, MessageCircle, Mic2, GraduationCap, Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";

const EVENT_TYPES = [
  { v: "drowsiness", label: "Drowsiness" },
  { v: "distraction", label: "Eyes off road" },
  { v: "phone_use", label: "Phone in hand" },
  { v: "lane_drift", label: "Lane drift" },
  { v: "harsh_brake", label: "Harsh brake" },
  { v: "speeding", label: "Speeding" },
  { v: "tailgating", label: "Tailgating" },
  { v: "no_seatbelt", label: "No seatbelt" },
];

const ACTION_CATALOG = [
  { v: "message", label: "In-app message", Icon: MessageCircle, desc: "Delivered to driver Messages + coaching inbox." },
  { v: "jade_voice", label: "JADE voice nudge", Icon: Mic2, desc: "Spoken aloud by JADE Nova TTS in cab." },
  { v: "coach", label: "Coaching session", Icon: GraduationCap, desc: "Adds a card to driver coaching inbox." },
  { v: "flag", label: "Flag for safety review", Icon: Flag, desc: "Marks event for ops review queue." },
];

const emptyRule = () => ({
  name: "",
  event_types: [],
  min_severity: 2,
  threshold_count: 1,
  window_minutes: 30,
  actions: [{ type: "message", template: "", use_ai: true }],
  enabled: true,
});

export default function SafetyAutomationsPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | rule
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/safety/rules");
      setRules(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openNew = () => { setEditing(emptyRule()); setOpen(true); };
  const openEdit = (r) => { setEditing(JSON.parse(JSON.stringify(r))); setOpen(true); };

  const toggleEnabled = async (rule) => {
    try {
      await api.patch(`/safety/rules/${rule.id}`, { enabled: !rule.enabled });
      await refresh();
    } catch {
      toast.error("Toggle failed");
    }
  };

  const deleteRule = async (rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await api.delete(`/safety/rules/${rule.id}`);
      await refresh();
      toast.success("Rule deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Name is required");
    if (!editing.event_types.length) return toast.error("Pick at least one event type");
    if (!editing.actions.length) return toast.error("Pick at least one action");
    try {
      if (editing.id) {
        const { id, ...payload } = editing;
        await api.patch(`/safety/rules/${id}`, payload);
        toast.success("Rule updated");
      } else {
        await api.post("/safety/rules", editing);
        toast.success("Rule created");
      }
      setOpen(false);
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-auto h-full" data-testid="safety-automations-page">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Safety · Automation Engine</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Cabin-event Automations</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Define rules that automatically respond to in-cab camera events.
            JADE drafts coaching messages with Claude AI — you can override with your own template.
          </p>
        </div>
        <Button onClick={openNew} className="btn-lime hover:btn-lime" data-testid="new-rule-btn">
          <Plus className="w-4 h-4 mr-2" /> New rule
        </Button>
      </header>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : rules.length === 0 ? (
        <Card className="jade-panel p-10 text-center" data-testid="rules-empty">
          <Bot className="w-12 h-12 text-primary mx-auto mb-3" />
          <div className="text-lg font-semibold mb-1">No automations yet</div>
          <div className="text-sm text-muted-foreground">Create a rule to start auto-responding to cabin events.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="rules-list">
          {rules.map((r) => <RuleCard key={r.id} rule={r} onEdit={openEdit} onToggle={toggleEnabled} onDelete={deleteRule} />)}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" data-testid="rule-editor">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit rule" : "New automation rule"}</DialogTitle>
          </DialogHeader>
          {editing && <RuleEditor rule={editing} setRule={setEditing} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="rule-cancel-btn">Cancel</Button>
            <Button onClick={save} className="btn-lime hover:btn-lime" data-testid="rule-save-btn"><Save className="w-4 h-4 mr-2" /> Save rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleCard({ rule, onEdit, onToggle, onDelete }) {
  return (
    <Card className={`jade-panel p-4 ${rule.enabled ? "" : "opacity-60"}`} data-testid={`rule-card-${rule.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold leading-tight">{rule.name}</h3>
            {rule.enabled ? (
              <Badge variant="outline" className="mono text-[10px] uppercase tracking-widest border-primary/40 text-primary">Active</Badge>
            ) : (
              <Badge variant="outline" className="mono text-[10px] uppercase tracking-widest">Off</Badge>
            )}
          </div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Trigger · {rule.threshold_count} of {rule.event_types.length} type{rule.event_types.length > 1 ? "s" : ""} · sev ≥ {rule.min_severity} · in {rule.window_minutes}m
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Switch checked={rule.enabled} onCheckedChange={() => onToggle(rule)} data-testid={`toggle-${rule.id}`} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mt-3">
        {rule.event_types.map((t) => {
          const m = EVENT_TYPES.find((x) => x.v === t);
          return <Badge key={t} variant="outline" className="text-[10px]">{m?.label || t}</Badge>;
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {rule.actions.map((a, i) => {
          const def = ACTION_CATALOG.find((x) => x.v === a.type);
          if (!def) return null;
          const Icon = def.Icon;
          return (
            <div key={i} className="flex items-start gap-2 text-xs border border-border rounded-md p-2 bg-card/40">
              <Icon className="w-3.5 h-3.5 text-primary mt-0.5" />
              <div className="min-w-0">
                <div className="font-medium">{def.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{a.template || (a.use_ai ? "AI drafted" : "")}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" size="sm" onClick={() => onDelete(rule)} data-testid={`delete-${rule.id}`}>
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEdit(rule)} data-testid={`edit-${rule.id}`}>Edit</Button>
      </div>
    </Card>
  );
}

function RuleEditor({ rule, setRule }) {
  const set = (patch) => setRule({ ...rule, ...patch });
  const toggleEventType = (v) => {
    const has = rule.event_types.includes(v);
    set({ event_types: has ? rule.event_types.filter((x) => x !== v) : [...rule.event_types, v] });
  };
  const addAction = (type) => set({ actions: [...rule.actions, { type, template: "", use_ai: true }] });
  const removeAction = (i) => set({ actions: rule.actions.filter((_, idx) => idx !== i) });
  const setAction = (i, patch) => set({ actions: rule.actions.map((a, idx) => idx === i ? { ...a, ...patch } : a) });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Rule name</Label>
        <Input value={rule.name} onChange={(e) => set({ name: e.target.value })} placeholder="Drowsiness · auto-coach" data-testid="rule-name-input" />
      </div>

      <div className="space-y-2">
        <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Event types (any of)</Label>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((t) => (
            <label key={t.v} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`event-type-${t.v}`}>
              <Checkbox checked={rule.event_types.includes(t.v)} onCheckedChange={() => toggleEventType(t.v)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Min severity</Label>
          <Select value={String(rule.min_severity)} onValueChange={(v) => set({ min_severity: parseInt(v, 10) })}>
            <SelectTrigger data-testid="min-severity"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Threshold</Label>
          <Input type="number" min={1} max={20} value={rule.threshold_count} onChange={(e) => set({ threshold_count: Math.max(1, parseInt(e.target.value || "1", 10)) })} data-testid="threshold" />
        </div>
        <div className="space-y-1.5">
          <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Window (min)</Label>
          <Input type="number" min={1} max={1440} value={rule.window_minutes} onChange={(e) => set({ window_minutes: Math.max(1, parseInt(e.target.value || "1", 10)) })} data-testid="window" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="mono text-[10px] tracking-widest uppercase text-muted-foreground">Actions</Label>
          <Select onValueChange={addAction}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="add-action-select"><SelectValue placeholder="+ add action" /></SelectTrigger>
            <SelectContent>{ACTION_CATALOG.map((a) => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          {rule.actions.map((a, i) => {
            const def = ACTION_CATALOG.find((x) => x.v === a.type);
            if (!def) return null;
            const Icon = def.Icon;
            return (
              <div key={i} className="border border-border rounded-md p-3 bg-card/40" data-testid={`action-row-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{def.label}</span>
                  <span className="text-[10px] text-muted-foreground">· {def.desc}</span>
                  <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => removeAction(i)} data-testid={`remove-action-${i}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch checked={a.use_ai} onCheckedChange={(v) => setAction(i, { use_ai: v })} />
                  <span className="mono text-[10px] tracking-widest uppercase text-muted-foreground flex items-center gap-1">
                    <Wand2 className="w-3 h-3 text-primary" /> Claude AI draft
                  </span>
                </div>
                <Textarea
                  value={a.template}
                  onChange={(e) => setAction(i, { template: e.target.value })}
                  placeholder={a.use_ai ? "Optional override template. Variables: {driver} {event} {location} {severity}" : "Required template. Variables: {driver} {event} {location} {severity}"}
                  rows={2}
                  className="text-sm"
                  data-testid={`template-${i}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Switch checked={rule.enabled} onCheckedChange={(v) => set({ enabled: v })} data-testid="rule-enabled-toggle" />
        <span className="mono text-[11px] tracking-widest uppercase">{rule.enabled ? "Active" : "Off"}</span>
        {rule.id && (
          <span className="mono text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
            <Power className="w-3 h-3" /> {rule.id.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}

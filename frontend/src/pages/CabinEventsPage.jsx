import React, { useEffect, useState, useCallback } from "react";
import { Camera, Activity, ShieldAlert, Bot, Mic2, MessageCircle, GraduationCap, Flag, Play, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

const ACTION_ICON = {
  message: MessageCircle,
  jade_voice: Mic2,
  coach: GraduationCap,
  flag: Flag,
};

const STATUS_TONE = {
  new: "bg-primary/15 text-primary border-primary/40",
  flagged_for_review: "bg-destructive/20 text-destructive border-destructive/40",
  reviewed: "bg-muted text-muted-foreground border-border",
  dismissed: "bg-muted/50 text-muted-foreground border-border",
};

const sevColor = (s) =>
  s >= 4 ? "text-destructive" : s >= 3 ? "text-yellow-400" : "text-primary";

export default function CabinEventsPage() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filterType !== "all") qs.set("event_type", filterType);
      if (filterStatus !== "all") qs.set("status", filterStatus);
      qs.set("limit", "50");
      const [{ data: evs }, { data: st }] = await Promise.all([
        api.get(`/cabin/events?${qs.toString()}`),
        api.get("/safety/stats"),
      ]);
      setEvents(evs);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);
  // Poll every 15s for ambient simulator activity.
  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    api.get(`/cabin/events/${selected}`).then(({ data }) => { if (alive) setDetail(data); });
    return () => { alive = false; };
  }, [selected]);

  const simulate = async () => {
    setSimulating(true);
    try {
      const { data } = await api.post("/cabin/events/simulate");
      toast.success(`Simulated ${data.event.event_type} · ${data.actions_fired.length} action(s) fired`);
      await refresh();
      setSelected(data.event.id);
    } catch {
      toast.error("Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/cabin/events/${id}`, { status });
      await refresh();
      if (selected === id) {
        const { data } = await api.get(`/cabin/events/${id}`);
        setDetail(data);
      }
    } catch {
      toast.error("Update failed");
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-auto h-full" data-testid="cabin-events-page">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Safety · Live Cabin Feed</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Cabin Camera Events</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live in-cab events stream in here. JADE auto-responds based on your active rules.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} data-testid="cabin-refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={simulate} disabled={simulating} className="btn-lime hover:btn-lime" data-testid="cabin-simulate-btn">
            <Play className="w-4 h-4 mr-2" /> {simulating ? "Simulating…" : "Simulate event"}
          </Button>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="cabin-stats">
        <Kpi icon={Activity} label="Events · 24h" value={stats?.events_24h ?? "—"} testid="kpi-events" />
        <Kpi icon={Flag} label="Flagged" value={stats?.flagged_for_review ?? "—"} testid="kpi-flagged" />
        <Kpi icon={Bot} label="Auto-actions · 24h" value={stats?.auto_actions_24h ?? "—"} testid="kpi-actions" />
        <Kpi icon={ShieldAlert} label="Rules active" value={stats?.rules_active ?? "—"} testid="kpi-rules" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Event list */}
        <Card className="jade-panel p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 mono text-[11px] tracking-widest uppercase text-muted-foreground">
              <Camera className="w-3.5 h-3.5" /> Recent events ({events.length})
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="filter-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="filter-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="flagged_for_review">Flagged</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : events.length === 0 ? (
            <div className="text-muted-foreground text-sm" data-testid="cabin-empty">
              No events yet. Hit &quot;Simulate event&quot; to trigger one — the ambient simulator also runs every 35–55s.
            </div>
          ) : (
            <ul className="divide-y divide-border/40 -mx-2" data-testid="cabin-event-list">
              {events.map((e) => (
                <li
                  key={e.id}
                  className={`px-2 py-3 cursor-pointer hover:bg-card/60 transition-colors ${selected === e.id ? "bg-card/70" : ""}`}
                  onClick={() => setSelected(e.id)}
                  data-testid={`event-row-${e.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-md flex items-center justify-center bg-card border border-border ${sevColor(e.severity)}`}>
                      <Activity className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{e.label}</span>
                        <span className={`mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${STATUS_TONE[e.status] || STATUS_TONE.new}`}>
                          {(e.status || "new").replace(/_/g, " ")}
                        </span>
                        <span className={`mono text-[10px] ${sevColor(e.severity)}`}>SEV {e.severity}/5</span>
                      </div>
                      <div className="mono text-[10px] text-muted-foreground mt-0.5">
                        {e.driver_name} · {e.location?.city}, {e.location?.state} · {new Date(e.occurred_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Event detail */}
        <Card className="jade-panel p-4 max-h-[70vh] overflow-auto" data-testid="event-detail-pane">
          {!detail ? (
            <div className="text-muted-foreground text-sm">Select an event to see auto-actions taken.</div>
          ) : (
            <EventDetail detail={detail} onStatus={(s) => setStatus(detail.event.id, s)} />
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, testid }) {
  return (
    <Card className="jade-panel p-4 flex items-center gap-3" data-testid={testid}>
      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function EventDetail({ detail, onStatus }) {
  const e = detail.event;
  const actions = detail.actions || [];
  return (
    <div className="space-y-4">
      <div>
        <div className="mono text-[10px] uppercase tracking-widest text-primary">{e.event_type.replace(/_/g, " ")}</div>
        <div className="text-lg font-semibold">{e.label}</div>
        <div className="mono text-[11px] text-muted-foreground mt-1">
          {e.driver_name} · {e.location?.city}, {e.location?.state} · {new Date(e.occurred_at).toLocaleString()}
          {e.speed_mph ? ` · ${e.speed_mph} mph` : ""}
        </div>
        <div className="mt-2">
          <Badge variant="outline" className={`mono text-[10px] uppercase tracking-widest ${STATUS_TONE[e.status]}`}>{(e.status || "new").replace(/_/g, " ")}</Badge>
          <Badge variant="outline" className={`ml-2 mono text-[10px] ${sevColor(e.severity)}`}>SEV {e.severity}/5</Badge>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="event-status-actions">
        <Button size="sm" variant="outline" onClick={() => onStatus("reviewed")} data-testid="mark-reviewed-btn">Mark reviewed</Button>
        <Button size="sm" variant="outline" onClick={() => onStatus("flagged_for_review")} data-testid="mark-flagged-btn">Flag</Button>
        <Button size="sm" variant="ghost" onClick={() => onStatus("dismissed")} data-testid="dismiss-btn">Dismiss</Button>
      </div>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions" data-testid="tab-actions">Auto-actions ({actions.length})</TabsTrigger>
          <TabsTrigger value="meta" data-testid="tab-meta">Meta</TabsTrigger>
        </TabsList>
        <TabsContent value="actions" className="space-y-2 mt-3">
          {actions.length === 0 ? (
            <div className="text-muted-foreground text-sm">No rules matched. Add one in Safety Automations.</div>
          ) : actions.map((a) => {
            const Icon = ACTION_ICON[a.action_type] || Bot;
            return (
              <div key={a.id} className="border border-border rounded-md p-3 bg-card/40" data-testid={`action-${a.action_type}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="mono text-[10px] uppercase tracking-widest text-primary">{a.action_type.replace(/_/g, " ")}</span>
                  <span className="mono text-[10px] text-muted-foreground ml-auto">{a.rule_name}</span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{a.text}</div>
              </div>
            );
          })}
        </TabsContent>
        <TabsContent value="meta" className="mt-3">
          <pre className="mono text-[10px] bg-card/40 p-3 rounded border border-border overflow-auto">{JSON.stringify(e, null, 2)}</pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

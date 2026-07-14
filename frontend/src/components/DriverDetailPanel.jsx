import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Mic2, Truck, MapPin, ClipboardCheck, Activity, AlertTriangle,
  CheckCircle2, Circle, Camera, ScanLine, RefreshCw, Radio, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";

const ACTION_ICON = { checkbox: ClipboardCheck, photo: Camera, scan: ScanLine };
const SEV_TONE = {
  1: "text-primary", 2: "text-primary",
  3: "text-yellow-400", 4: "text-destructive", 5: "text-destructive",
};

const QUICK_TEMPLATES = [
  "Heads-up — storm cell reported on your route. Slow it down.",
  "How's the load feeling? Any detention issues at the dock?",
  "Great HOS numbers today. Keep it steady.",
  "Fuel is 22¢ cheaper 40 miles ahead — top off there.",
];

export default function DriverDetailPanel({ email, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [voice, setVoice] = useState(true);
  const [sending, setSending] = useState(false);
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!email) return;
    try {
      const { data } = await api.get(`/broker/watch/${encodeURIComponent(email)}`);
      setData(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [email]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useEffect(() => {
    if (!email) return;
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [email, refresh]);

  const sendPing = async () => {
    const text = msg.trim();
    if (!text) return toast.error("Type a message first.");
    setSending(true);
    try {
      await api.post("/broker/ping-driver", { driver_email: email, message: text, with_voice: voice });
      toast.success(`Ping sent to ${data?.driver?.name || email}`);
      setMsg("");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ping failed");
    } finally { setSending(false); }
  };

  return (
    <AnimatePresence>
      {email && (
        <>
          {/* Scrim */}
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[55] bg-background/60 backdrop-blur-sm"
            data-testid="driver-panel-scrim"
          />
          {/* Slide-in panel */}
          <motion.aside
            key="panel"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 240 }}
            className="fixed right-0 top-0 bottom-0 z-[56] w-full max-w-[520px] jade-glass border-l border-primary/30 shadow-[-30px_0_60px_hsl(var(--primary)/0.15)] flex flex-col"
            data-testid="driver-panel"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/40 flex items-start gap-3">
              {data?.driver?.avatar ? (
                <img src={data.driver.avatar} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/50" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="mono text-[10px] tracking-[0.3em] uppercase text-primary">Driver detail</div>
                <div className="text-lg font-bold truncate" data-testid="driver-panel-name">{data?.driver?.name || email}</div>
                <div className="mono text-[10px] text-muted-foreground truncate">
                  {data?.driver?.callsign && <span>{data.driver.callsign} · </span>}{email}
                </div>
              </div>
              <button onClick={onClose} className="h-9 w-9 rounded-full hover:bg-card/60 flex items-center justify-center" data-testid="driver-panel-close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live strip */}
            {data?.sim && (
              <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3 text-sm" data-testid="driver-panel-live">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-medium">{data.sim.city}, {data.sim.state}</span>
                <span className="text-muted-foreground">· {Math.round(data.sim.miles || 0)}/{data.sim.total_mi} mi</span>
                <div className="ml-auto flex items-center gap-2">
                  <Badge variant="outline" className={`mono text-[9px] uppercase tracking-widest ${data.sim.status === "running" ? "text-primary border-primary/50" : "text-emerald-400 border-emerald-500/50"}`}>
                    {data.sim.status}
                  </Badge>
                </div>
              </div>
            )}

            {/* Body scroll */}
            <div className="flex-1 overflow-auto px-4 py-4 space-y-5">
              {loading && !data && <div className="text-muted-foreground text-sm">Loading…</div>}

              {/* Workflow */}
              {data?.workflow && (
                <Section
                  icon={ClipboardCheck}
                  title="Live workflow"
                  right={`${data.workflow.completed}/${data.workflow.total} done`}
                  testid="section-workflow"
                >
                  <div className="space-y-1.5">
                    {data.workflow.steps.map((s) => {
                      const done = s.status === "completed";
                      const Icon = ACTION_ICON[s.action] || ClipboardCheck;
                      return (
                        <div key={s.id} className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${done ? "opacity-60" : "bg-card/40"}`} data-testid={`panel-step-${s.key}`}>
                          {done ? <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
                          <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-medium ${done ? "line-through" : ""}`}>{s.title}</div>
                            <div className="mono text-[9px] text-muted-foreground">{s.detail}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Cabin events */}
              <Section
                icon={Activity}
                title="Last cabin events"
                right={`${data?.events?.length || 0}`}
                testid="section-events"
              >
                {(!data?.events || data.events.length === 0) ? (
                  <div className="text-xs text-muted-foreground">No events on file.</div>
                ) : data.events.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 py-1.5 border-b border-border/30 last:border-0" data-testid={`panel-event-${e.id}`}>
                    <img
                      src={e.thumb_url || "https://images.unsplash.com/photo-1601584115197-04ecc0da31ba?w=120&h=80&fit=crop"}
                      alt=""
                      className="w-14 h-10 rounded object-cover ring-1 ring-border/60 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{e.label || e.event_type}</span>
                        <span className={`mono text-[9px] ${SEV_TONE[e.severity] || "text-primary"}`}>SEV {e.severity}/5</span>
                        {e.status === "flagged_for_review" && <Badge variant="outline" className="mono text-[9px] uppercase tracking-widest border-destructive/60 text-destructive">flagged</Badge>}
                      </div>
                      <div className="mono text-[9px] text-muted-foreground mt-0.5">
                        {e.location?.city}, {e.location?.state} · {new Date(e.occurred_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </Section>

              {/* Alerts */}
              <Section
                icon={AlertTriangle}
                title="Open alerts"
                right={`${data?.alerts?.length || 0}`}
                testid="section-alerts"
              >
                {(!data?.alerts || data.alerts.length === 0) ? (
                  <div className="text-xs text-muted-foreground">No open alerts.</div>
                ) : data.alerts.map((a) => (
                  <div key={a.id} className="rounded-md px-2 py-2 bg-card/40 border border-border/40 mb-1.5 last:mb-0" data-testid={`panel-alert-${a.id}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`mono text-[9px] uppercase tracking-widest ${a.severity === "critical" ? "text-destructive border-destructive/50" : a.severity === "warning" ? "text-yellow-400 border-yellow-500/50" : "text-primary border-primary/50"}`}>
                        {a.severity}
                      </Badge>
                      <span className="text-xs font-medium truncate">{a.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.body}</div>
                  </div>
                ))}
              </Section>
            </div>

            {/* Ping composer */}
            <div className="border-t border-border/40 p-4 space-y-2 bg-card/50" data-testid="ping-composer">
              <div className="flex items-center justify-between">
                <div className="mono text-[10px] tracking-[0.3em] uppercase text-primary flex items-center gap-2">
                  <Radio className="w-3 h-3" /> Ping driver
                </div>
                <label className="flex items-center gap-2 mono text-[9px] tracking-widest uppercase text-muted-foreground">
                  <span>Voice (TTS)</span>
                  <Switch checked={voice} onCheckedChange={setVoice} data-testid="ping-voice-toggle" />
                </label>
              </div>
              {/* Quick templates */}
              <div className="flex gap-1.5 flex-wrap">
                {QUICK_TEMPLATES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setMsg(t)}
                    className="mono text-[9px] tracking-widest uppercase px-2 py-1 rounded-full border border-border/70 text-muted-foreground hover:border-primary/60 hover:text-primary transition-colors truncate max-w-[240px]"
                    data-testid="ping-template"
                    title={t}
                  >
                    {t.slice(0, 28)}…
                  </button>
                ))}
              </div>
              <Textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Type your message to the driver…"
                rows={2}
                className="text-sm resize-none"
                data-testid="ping-textarea"
              />
              <div className="flex items-center justify-between">
                <span className="mono text-[9px] text-muted-foreground">Lands in the driver's JADE inbox{voice ? " · spoken aloud" : ""}.</span>
                <Button onClick={sendPing} disabled={sending || !msg.trim()} className="btn-lime hover:btn-lime" data-testid="ping-send-btn">
                  <Send className="w-3.5 h-3.5 mr-1" /> {sending ? "Sending…" : "Send ping"}
                </Button>
              </div>
              {(data?.recent_pings || []).length > 0 && (
                <details className="pt-1 border-t border-border/30">
                  <summary className="mono text-[9px] tracking-widest uppercase text-muted-foreground cursor-pointer flex items-center gap-1">
                    Recent pings <ChevronDown className="w-3 h-3" />
                  </summary>
                  <div className="mt-1 space-y-1">
                    {data.recent_pings.slice(0, 4).map((p) => (
                      <div key={p.id} className="text-[10px] text-muted-foreground flex items-start gap-2" data-testid="recent-ping">
                        {p.kind === "voice" ? <Mic2 className="w-3 h-3 text-primary shrink-0 mt-0.5" /> : <Send className="w-3 h-3 text-primary shrink-0 mt-0.5" />}
                        <span className="truncate">{p.text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ icon: Icon, title, right, children, testid }) {
  return (
    <section data-testid={testid}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">{title}</span>
        {right != null && <span className="ml-auto mono text-[10px] text-muted-foreground">{right}</span>}
      </div>
      {children}
    </section>
  );
}

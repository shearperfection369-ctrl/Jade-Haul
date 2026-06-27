import React, { useEffect, useState, useCallback } from "react";
import { GraduationCap, MessageCircle, Mic2, CheckCircle2, Volume2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { speak } from "@/lib/tts";

const SEV_TONE = {
  1: "text-primary",
  2: "text-primary",
  3: "text-yellow-400",
  4: "text-destructive",
  5: "text-destructive",
};

export default function DriverCoachingPage() {
  const [data, setData] = useState({ sessions: [], nudges: [] });
  const [loading, setLoading] = useState(true);
  const [speakingId, setSpeakingId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/driver/coaching");
      setData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  const ackSession = async (s) => {
    try {
      await api.patch(`/driver/coaching/${s.id}`, { status: "completed" });
      toast.success("Marked complete");
      refresh();
    } catch {
      toast.error("Failed");
    }
  };

  const ackNudge = async (n) => {
    try {
      await api.patch(`/driver/nudges/${n.id}`);
      refresh();
    } catch {
      toast.error("Failed");
    }
  };

  const playNudge = async (n) => {
    if (speakingId) return;
    setSpeakingId(n.id);
    try {
      await speak(n.text);
    } catch {
      toast.error("Voice playback failed");
    } finally {
      setSpeakingId(null);
    }
  };

  const openSessions = data.sessions.filter((s) => s.status !== "completed");
  const completedSessions = data.sessions.filter((s) => s.status === "completed");
  const unreadNudges = data.nudges.filter((n) => !n.ack);

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-auto h-full" data-testid="coaching-page">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary mb-1">Driver · Safety Coaching</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Coaching Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            JADE and your fleet manager send you coaching nudges here when in-cab events are detected. Tap to acknowledge.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} data-testid="coach-refresh-btn">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="coaching-kpis">
        <Kpi icon={Mic2} label="Voice nudges" value={unreadNudges.filter((n) => n.kind === "voice").length} testid="kpi-voice" />
        <Kpi icon={MessageCircle} label="Messages" value={unreadNudges.filter((n) => n.kind === "message").length} testid="kpi-msg" />
        <Kpi icon={GraduationCap} label="Open coaching" value={openSessions.length} testid="kpi-coach" />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">Active ({openSessions.length + unreadNudges.length})</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History ({completedSessions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-4">
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : openSessions.length === 0 && unreadNudges.length === 0 ? (
            <Card className="jade-panel p-8 text-center" data-testid="coaching-empty">
              <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
              <div className="font-semibold">You&apos;re all clear</div>
              <div className="text-sm text-muted-foreground mt-1">No active coaching nudges. Drive safe.</div>
            </Card>
          ) : (
            <>
              {unreadNudges.length > 0 && (
                <div className="space-y-2" data-testid="nudges-list">
                  <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">Nudges</div>
                  {unreadNudges.map((n) => (
                    <Card key={n.id} className="jade-panel p-4" data-testid={`nudge-${n.id}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {n.kind === "voice" ? <Mic2 className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm">{n.title}</span>
                            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{n.kind}</span>
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{n.text}</p>
                          <div className="mono text-[10px] text-muted-foreground mt-2">{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-3">
                        {n.kind === "voice" && (
                          <Button variant="outline" size="sm" onClick={() => playNudge(n)} disabled={speakingId === n.id} data-testid={`play-${n.id}`}>
                            <Volume2 className="w-3.5 h-3.5 mr-1" /> {speakingId === n.id ? "Playing…" : "Play"}
                          </Button>
                        )}
                        <Button size="sm" onClick={() => ackNudge(n)} data-testid={`ack-${n.id}`} className="btn-lime hover:btn-lime">Got it</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {openSessions.length > 0 && (
                <div className="space-y-2" data-testid="sessions-list">
                  <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary mt-4">Coaching sessions</div>
                  {openSessions.map((s) => (
                    <SessionCard key={s.id} s={s} onComplete={() => ackSession(s)} />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2 mt-4">
          {completedSessions.length === 0 ? (
            <Card className="jade-panel p-6 text-muted-foreground text-sm">No completed sessions yet.</Card>
          ) : completedSessions.map((s) => <SessionCard key={s.id} s={s} completed />)}
        </TabsContent>
      </Tabs>
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

function SessionCard({ s, onComplete, completed }) {
  return (
    <Card className="jade-panel p-4" data-testid={`session-${s.id}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <GraduationCap className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold">{s.topic}</span>
            <Badge variant="outline" className={`mono text-[10px] uppercase tracking-widest ${SEV_TONE[s.severity] || "text-primary"}`}>SEV {s.severity}/5</Badge>
            {completed && <Badge variant="outline" className="mono text-[10px] uppercase tracking-widest border-primary/40 text-primary">Completed</Badge>}
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{s.summary}</p>
          <div className="mono text-[10px] text-muted-foreground mt-2">{new Date(s.created_at).toLocaleString()}</div>
        </div>
      </div>
      {!completed && (
        <div className="flex justify-end mt-3">
          <Button size="sm" onClick={onComplete} className="btn-lime hover:btn-lime" data-testid={`complete-${s.id}`}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark complete
          </Button>
        </div>
      )}
    </Card>
  );
}

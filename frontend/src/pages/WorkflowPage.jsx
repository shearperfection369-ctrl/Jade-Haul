import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Camera, ClipboardCheck, RefreshCw, ScanLine, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const ACTION_META = {
  checkbox: { icon: ClipboardCheck, label: "Confirm" },
  photo:    { icon: Camera,         label: "Attach photo" },
  scan:     { icon: ScanLine,       label: "Open scanner" },
};

export default function WorkflowPage() {
  const [wf, setWf] = useState({ steps: [], completed: 0, total: 0, percent: 0 });
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState({});
  const nav = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/driver/workflow");
      setWf(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const complete = async (step) => {
    try {
      await api.post(`/driver/workflow/${step.id}/complete`, { notes: note[step.id] || "" });
      setNote((n) => { const c = { ...n }; delete c[step.id]; return c; });
      await refresh();
      toast.success(`${step.title} — complete`);
      if (step.action === "scan" && step.key === "fuel_scan") nav("/driver/fuel");
      if (step.action === "scan" && step.key === "bol_pickup") nav("/driver/scan");
    } catch { toast.error("Could not save"); }
  };

  const reopen = async (step) => {
    try { await api.post(`/driver/workflow/${step.id}/reopen`); await refresh(); } catch { /* silent */ }
  };

  const reset = async () => {
    if (!window.confirm("Reset the checklist to blank?")) return;
    try { await api.post("/driver/workflow/reset"); await refresh(); toast.success("Checklist reset"); } catch { toast.error("Reset failed"); }
  };

  const activeIndex = wf.steps.findIndex((s) => s.status !== "completed");

  return (
    <div className="p-6 lg:p-8 space-y-6 overflow-auto h-full" data-testid="workflow-page">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.3em] text-primary mb-1">JADE · Load Workflow</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Run the Load</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-orchestrated checklist — JADE walks you from pre-trip to signed BOL.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} data-testid="workflow-reset-btn">
          <RefreshCw className="w-4 h-4 mr-2" /> Reset
        </Button>
      </header>

      {/* Progress hero */}
      <Card className="jade-panel p-5" data-testid="workflow-progress">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" stroke="hsl(var(--muted))" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="42"
                stroke="hsl(var(--primary))"
                strokeWidth="8" fill="none" strokeLinecap="round"
                strokeDasharray={`${(2 * Math.PI * 42 * wf.percent) / 100} ${2 * Math.PI * 42}`}
                style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary)))", transition: "stroke-dasharray 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center mono text-lg font-bold text-primary">{wf.percent}%</div>
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">{wf.completed} of {wf.total} steps complete</div>
            <div className="mono text-[11px] tracking-widest text-muted-foreground uppercase">
              {activeIndex >= 0 ? `Next up · ${wf.steps[activeIndex]?.title}` : "Load closed. Great haul."}
            </div>
          </div>
          {activeIndex >= 0 && (
            <ChevronRight className="w-5 h-5 text-primary animate-pulse hidden md:block" />
          )}
        </div>
      </Card>

      {loading ? (
        <div className="text-muted-foreground">Loading checklist…</div>
      ) : (
        <div className="space-y-3" data-testid="workflow-steps">
          {wf.steps.map((s, i) => {
            const meta = ACTION_META[s.action] || ACTION_META.checkbox;
            const done = s.status === "completed";
            const isActive = i === activeIndex;
            const Icon = meta.icon;
            return (
              <Card
                key={s.id}
                className={`jade-panel p-4 border ${
                  done ? "opacity-60" : isActive ? "border-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.15)]" : "border-border/50"
                }`}
                data-testid={`step-${s.key}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {done ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Circle className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-[10px] tracking-widest text-muted-foreground uppercase">Step {i + 1}</span>
                      <span className={`font-semibold text-sm ${done ? "line-through" : ""}`}>{s.title}</span>
                      {isActive && !done && <Badge variant="outline" className="mono text-[10px] uppercase tracking-widest border-primary/60 text-primary">Active</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{s.detail}</div>
                    {!done && isActive && (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={note[s.id] || ""}
                          onChange={(e) => setNote((n) => ({ ...n, [s.id]: e.target.value }))}
                          placeholder="Optional notes…"
                          rows={1}
                          className="text-sm"
                          data-testid={`step-note-${s.key}`}
                        />
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => complete(s)} className="btn-lime hover:btn-lime" data-testid={`step-complete-${s.key}`}>
                            <Icon className="w-3.5 h-3.5 mr-1" /> {meta.label}
                          </Button>
                        </div>
                      </div>
                    )}
                    {done && (
                      <div className="mt-2 flex items-center gap-2">
                        {s.notes && <span className="mono text-[10px] text-muted-foreground italic">&ldquo;{s.notes}&rdquo;</span>}
                        <Button variant="ghost" size="sm" className="ml-auto text-[10px]" onClick={() => reopen(s)} data-testid={`step-reopen-${s.key}`}>Reopen</Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

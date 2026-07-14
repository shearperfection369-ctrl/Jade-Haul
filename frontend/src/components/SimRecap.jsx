import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, MapPin, Activity, AlertTriangle, GraduationCap, ClipboardCheck, Gauge, X, Sparkles, Volume2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import { speak } from "@/lib/tts";
import { toast } from "sonner";

const HAS_SEEN_KEY = "jadehaul.sim.recap.seen";

/**
 * Sim Recap screen. Renders when the caller's latest simulation reaches
 * "delivered" status. Fades in with confetti-style celebratory motion,
 * displays aggregate KPIs + a Claude-drafted debrief, offers TTS narration.
 *
 * Uses localStorage to remember which sim IDs have already been recapped
 * so refreshing the page doesn't re-show it.
 */
export default function SimRecap() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [narrating, setNarrating] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer;
    const poll = async () => {
      if (!alive) return;
      try {
        const { data: st } = await api.get("/simulation/status");
        if (st && st.status === "delivered" && st.id) {
          const seen = JSON.parse(localStorage.getItem(HAS_SEEN_KEY) || "[]");
          if (!seen.includes(st.id)) {
            fetchRecap(st.id);
            return; // stop polling once we fire
          }
        }
      } catch { /* silent */ }
      timer = setTimeout(poll, 5000);
    };
    poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRecap = async (simId) => {
    setLoading(true);
    window.dispatchEvent(new Event("jade:thinking-start"));
    try {
      const { data } = await api.get("/simulation/recap");
      setData(data);
      setOpen(true);
      const seen = JSON.parse(localStorage.getItem(HAS_SEEN_KEY) || "[]");
      seen.push(simId);
      localStorage.setItem(HAS_SEEN_KEY, JSON.stringify(seen.slice(-20)));
    } catch (e) {
      toast.error("Recap unavailable — retry later.");
    } finally {
      setLoading(false);
      window.dispatchEvent(new Event("jade:thinking-end"));
    }
  };

  const narrate = async () => {
    if (!data?.debrief || narrating) return;
    const clean = data.debrief.replace(/[#*_`]/g, "").replace(/\n{2,}/g, ". ").slice(0, 900);
    setNarrating(true);
    try { await speak(clean); } catch { /* silent */ }
    setNarrating(false);
  };

  const share = async () => {
    if (!data) return;
    const s = data.stats;
    const text = `Jade Haul · SIM DELIVERED\n${s.driver.name} · Fort Worth → Phoenix (${s.route.miles} mi)\nHOS efficiency ${s.hos_efficiency}%\n${s.events.total} cabin events · ${s.alerts.total} alerts · ${s.coaching.sessions_created} coaching sessions\n${s.workflow.completed}/${s.workflow.total} workflow steps closed.`;
    try {
      if (navigator.share) await navigator.share({ title: "Jade Haul Sim Recap", text });
      else { await navigator.clipboard.writeText(text); toast.success("Recap copied to clipboard"); }
    } catch { /* silent */ }
  };

  return (
    <AnimatePresence>
      {open && data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-md flex items-center justify-center p-4 overflow-auto"
          data-testid="sim-recap"
        >
          {/* Radial background beams */}
          <div className="absolute inset-0 pointer-events-none opacity-40">
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
              style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 60%)" }} />
            <div className="absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full"
              style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 60%)" }} />
          </div>

          <motion.div
            initial={{ scale: 0.9, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 180 }}
            className="relative w-full max-w-4xl jade-glass rounded-3xl border-2 border-primary/40 shadow-[0_0_80px_hsl(var(--primary)/0.35)] p-6 lg:p-10"
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-card/60 flex items-center justify-center"
              data-testid="recap-close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hero */}
            <div className="flex items-start gap-4">
              <motion.div
                initial={{ rotate: -20, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="relative w-16 h-16 rounded-2xl border border-primary/50 bg-primary/10 flex items-center justify-center shrink-0"
              >
                <div className="absolute inset-0 rounded-2xl scan-ring border border-primary/40" />
                <Trophy className="w-8 h-8 text-primary" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="mono text-[10px] tracking-[0.35em] uppercase text-primary">Simulation · Delivered</div>
                <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight mt-1">
                  {data.stats.driver.name}, that was a clean haul.
                </h1>
                <p className="text-muted-foreground text-sm mt-2">
                  Fort Worth, TX → Phoenix, AZ · {data.stats.route.miles} of {data.stats.route.total_mi} miles closed out.
                </p>
              </div>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6" data-testid="recap-kpis">
              <Kpi icon={MapPin}      label="Miles"          value={`${data.stats.route.miles}`} sub="of route" />
              <Kpi icon={Gauge}       label="HOS efficiency" value={`${data.stats.hos_efficiency}%`} sub="drive vs lost" glow />
              <Kpi icon={Activity}    label="Cabin events"   value={data.stats.events.total} sub={`${data.stats.events.flagged} flagged`} />
              <Kpi icon={AlertTriangle} label="Alerts"       value={data.stats.alerts.total} sub={`${data.stats.alerts.critical} critical`} />
              <Kpi icon={GraduationCap} label="Coaching"     value={data.stats.coaching.sessions_created} sub={`${data.stats.coaching.completed} completed`} />
              <Kpi icon={ClipboardCheck} label="Workflow"    value={`${data.stats.workflow.completed}/${data.stats.workflow.total}`} sub="steps closed" />
            </div>

            {/* Debrief */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 rounded-2xl border border-primary/30 bg-card/40 p-5 lg:p-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="mono text-[10px] tracking-[0.3em] uppercase text-primary">JADE debrief · Claude 4.5</span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={narrate} disabled={narrating} data-testid="recap-narrate-btn">
                  <Volume2 className="w-3.5 h-3.5 mr-1" /> {narrating ? "Playing…" : "Hear it"}
                </Button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none" data-testid="recap-debrief">
                <ReactMarkdown>{data.debrief}</ReactMarkdown>
              </div>
            </motion.div>

            {/* Footer actions */}
            <div className="mt-6 flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={share} data-testid="recap-share-btn">
                <Share2 className="w-4 h-4 mr-2" /> Share recap
              </Button>
              <Button className="btn-lime hover:btn-lime" onClick={() => setOpen(false)} data-testid="recap-continue-btn">
                Continue in cockpit →
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
      {loading && !open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="mono text-[11px] tracking-[0.3em] uppercase text-primary">Composing recap…</div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Kpi({ icon: Icon, label, value, sub, glow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + Math.random() * 0.2 }}
      className={`jade-panel p-3 rounded-xl border ${glow ? "border-primary/60 shadow-[0_0_18px_hsl(var(--primary)/0.25)]" : "border-border/60"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="mono text-[9px] tracking-[0.25em] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-extrabold leading-none">{value}</div>
      {sub && <div className="mono text-[10px] tracking-widest text-muted-foreground mt-1">{sub}</div>}
    </motion.div>
  );
}

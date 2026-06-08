import React from "react";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { useTheme, THEMES } from "@/context/ThemeContext";
import { CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <PageHeader title="Theme · Mood" subtitle="JadeOS · Personalize the cockpit" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              data-testid={`theme-${t.id}`}
              className={`text-left jade-panel p-5 transition-all hover:scale-[1.01] ${active ? "jade-tracing-border" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-[Unbounded] text-lg">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                {active && <CheckCircle2 className="w-5 h-5 text-primary" />}
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                <div className="h-10 rounded-md" style={{ background: t.accent, boxShadow: `0 0 14px ${t.accent}55` }} />
                <div className="h-10 rounded-md bg-card border border-border" />
                <div className="h-10 rounded-md bg-secondary" />
                <div className="h-10 rounded-md bg-background border border-border" />
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-3">data-theme=&quot;{t.id}&quot;</div>
            </button>
          );
        })}
      </div>

      <Card className="jade-panel p-5 mt-5 max-w-2xl">
        <div className="font-[Unbounded] text-base mb-2">About JadeOS</div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          A premium AI operating system for commercial truck drivers and freight brokers. JADE — your in-cab co-pilot —
          tracks Hours-of-Service, suggests breaks, optimizes routes, scans bills, manages detention time, and gives
          brokers carrier risk scoring and quote optimization in real-time.
        </div>
      </Card>
    </div>
  );
}

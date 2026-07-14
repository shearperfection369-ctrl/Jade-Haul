import React from "react";
import { Check, Palette, Sun } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/context/ThemeContext";

/**
 * Compact theme switcher trigger + rich dropdown list.
 * Reference layout: colored swatch square · name · description · optional LIGHT tag.
 * Selected row is highlighted with a border + inset accent.
 */
export default function ThemeSwitcher({ align = "start", side = "bottom", className = "" }) {
  const { theme, setTheme, themes, currentTheme } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border border-border/70 hover:border-primary/60 bg-card/40 hover:bg-card/70 transition-colors ${className}`}
          data-testid="theme-switcher-trigger"
          title="Change visual theme"
        >
          <span
            className="w-3.5 h-3.5 rounded-[3px] shadow-inner"
            style={{
              background: currentTheme.accent,
              boxShadow: `0 0 6px ${currentTheme.accent}90, inset 0 0 3px rgba(0,0,0,0.4)`,
            }}
          />
          <span className="mono text-[10px] tracking-[0.25em] uppercase text-foreground/90 truncate max-w-[110px]">
            {currentTheme.name}
          </span>
          <Palette className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        className="w-[320px] p-0 border-primary/30 shadow-[0_0_40px_hsl(var(--primary)/0.2)]"
        data-testid="theme-switcher-panel"
      >
        <div className="px-4 pt-3 pb-2 border-b border-border/40">
          <div className="mono text-[10px] tracking-[0.35em] uppercase text-muted-foreground">Visual theme</div>
        </div>
        <ScrollArea className="max-h-[70vh]">
          <div className="p-1.5">
            {themes.filter((t) => t.id !== "jade" && t.id !== "midnight" && t.id !== "sunset" && t.id !== "storm" && t.id !== "aurora").map((t) => {
              const selected = t.id === theme;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`w-full text-left flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all border ${
                    selected
                      ? "bg-primary/10 border-primary/50 shadow-[inset_0_0_20px_hsl(var(--primary)/0.15)]"
                      : "border-transparent hover:bg-card/70"
                  }`}
                  data-testid={`theme-option-${t.id}`}
                >
                  {/* Swatch */}
                  <span
                    className="mt-0.5 w-8 h-8 rounded-md border border-black/40 shrink-0 relative overflow-hidden"
                    style={{
                      background: t.light
                        ? `linear-gradient(135deg, #ffffff 0%, ${t.accent} 100%)`
                        : `linear-gradient(135deg, ${t.accent}dd 0%, ${t.accent}55 60%, #000000 100%)`,
                      boxShadow: selected ? `0 0 12px ${t.accent}80` : `0 0 6px ${t.accent}30`,
                    }}
                  >
                    {t.light && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Sun className="w-3 h-3 text-slate-800" />
                      </span>
                    )}
                  </span>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold leading-tight ${selected ? "text-primary" : ""}`}>{t.name}</span>
                      {t.light && (
                        <span className="mono text-[9px] tracking-[0.2em] uppercase px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                          LIGHT
                        </span>
                      )}
                      {selected && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{t.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
        <div className="px-4 py-2 border-t border-border/40 mono text-[9px] tracking-widest uppercase text-muted-foreground text-center">
          Ambient glow · alerts · charts follow this palette
        </div>
      </PopoverContent>
    </Popover>
  );
}

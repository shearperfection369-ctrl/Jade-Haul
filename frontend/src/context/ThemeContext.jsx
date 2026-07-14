import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Jade Haul visual themes.
 * Each theme sets a stylized palette via [data-theme] CSS blocks in index.css.
 * `accent` here is the swatch color shown in the picker; the actual CSS
 * variables (primary/background/etc) are set in index.css per data-theme.
 */
export const THEMES = [
  { id: "calafia",        name: "Calafia · Orisei",  accent: "#C9A227", description: "Gold leaf on deep navy — Queen Calafia heraldry" },
  { id: "hud-cyan",       name: "HUD Cyan",          accent: "#29D5F0", description: "Default — electric cyan on navy" },
  { id: "forest-calm",    name: "Forest Calm",       accent: "#329471", description: "Calming evergreen — easier on the eyes" },
  { id: "sunset-warm",    name: "Sunset Warm",       accent: "#E88A2A", description: "Warm amber on deep maroon — late shift" },
  { id: "arctic",         name: "Arctic",            accent: "#A6C8E0", description: "Cool ice blue — high focus" },
  { id: "lavender",       name: "Lavender",          accent: "#B39DDB", description: "Soft violet — relaxed concentration" },
  { id: "mocha",          name: "Mocha",             accent: "#C9A78C", description: "Espresso & cream — cozy warmth" },
  { id: "solar-light",    name: "Solar Light",       accent: "#F0E5D0", description: "Bright theme — daylight working", light: true },
  { id: "orisei-brand",   name: "Orisei Brand",      accent: "#2966CC", description: "Heraldic azure on midnight" },
  { id: "neon-tokyo",     name: "Neon Tokyo",        accent: "#E91E86", description: "Magenta-cyan synthwave · maximum HUD" },
  { id: "matrix-green",   name: "Matrix Green",      accent: "#22C55E", description: "Phosphor green on black — terminal mode" },
  { id: "amber-crt",      name: "Amber CRT",         accent: "#E8944C", description: "Vintage amber-monitor warmth" },
  { id: "midnight-steel", name: "Midnight Steel",    accent: "#6A87A8", description: "Deep navy + steel blue — maritime feel" },
  { id: "rose-quartz",    name: "Rose Quartz",       accent: "#C48B9C", description: "Muted pink on charcoal · gentle accent" },
  { id: "carbon-fiber",   name: "Carbon Fiber",      accent: "#7A8794", description: "Slate-on-slate stealth · minimalist" },
  // Keep the original as a hidden alias so old localStorage values still work
  { id: "jade",           name: "Jade OS",           accent: "#00FA9A", description: "Original Jade Haul HUD" },
];

const ThemeCtx = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem("jadeos.theme") || "jade");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // For light themes, also toggle the color-scheme so native form controls
    // (scrollbars, date pickers) match.
    const t = THEMES.find((x) => x.id === theme);
    document.documentElement.style.colorScheme = t?.light ? "light" : "dark";
    localStorage.setItem("jadeos.theme", theme);
  }, [theme]);

  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, themes: THEMES, currentTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
};

export const useTheme = () => useContext(ThemeCtx);

import React, { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "jade", name: "Jade Default", accent: "#00FA9A", description: "Premium AI HUD" },
  { id: "midnight", name: "Midnight", accent: "#1FA8FF", description: "Deep blue cockpit" },
  { id: "sunset", name: "Sunset Highway", accent: "#FF6A2A", description: "Magic-hour cab" },
  { id: "storm", name: "Storm", accent: "#C8DCFF", description: "Steel-grey calm" },
  { id: "aurora", name: "Aurora", accent: "#00FFD1", description: "Neon polar haze" },
];

const ThemeCtx = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem("jadeos.theme") || "jade");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("jadeos.theme", theme);
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeCtx.Provider>;
};

export const useTheme = () => useContext(ThemeCtx);

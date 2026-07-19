import React, { createContext, useContext, useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Theme = "dark" | "light";
export type ThemePref = "dark" | "light" | "system";

interface ThemeContextValue {
  /** Resolved theme actually applied to the DOM. */
  theme: Theme;
  /** The user's stored preference (may be "system"). */
  pref: ThemePref;
  toggle: (origin?: { x: number; y: number }) => void;
  setTheme: (t: Theme, origin?: { x: number; y: number }) => void;
  setPref: (p: ThemePref, origin?: { x: number; y: number }) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "productionos-theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readInitialPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    // ignore
  }
  return "dark";
}

const resolve = (p: ThemePref): Theme => (p === "system" ? systemTheme() : p);

/**
 * Circular-reveal theme change via the View Transitions API. Falls back to an
 * instant switch when the API is missing or the user prefers reduced motion.
 * Themes are just CSS vars, so the reveal is cheap — a clip-path animation over
 * a captured snapshot.
 */
function applyWithReveal(apply: () => void, origin?: { x: number; y: number }) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const startViewTransition = (document as any).startViewTransition?.bind(document);

  if (reduce || !startViewTransition) {
    apply();
    return;
  }

  const transition = startViewTransition(() => {
    // flushSync so the DOM attribute actually changes inside the captured frame.
    flushSync(apply);
  });

  transition.ready
    .then(() => {
      const x = origin?.x ?? window.innerWidth / 2;
      const y = origin?.y ?? 0;
      const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`],
        },
        {
          duration: 480,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    })
    .catch(() => {
      /* transition can be skipped — nothing to clean up */
    });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readInitialPref);
  const [theme, setThemeState] = useState<Theme>(() => resolve(readInitialPref()));

  // Apply resolved theme + persist preference.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* noop */
    }
  }, [pref]);

  // Follow the OS while on "system".
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setThemeState(systemTheme());
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [pref]);

  const setPref: ThemeContextValue["setPref"] = (p, origin) => {
    applyWithReveal(() => {
      setPrefState(p);
      setThemeState(resolve(p));
    }, origin);
  };

  const setTheme: ThemeContextValue["setTheme"] = (t, origin) => setPref(t, origin);

  const toggle: ThemeContextValue["toggle"] = (origin) =>
    setPref(theme === "dark" ? "light" : "dark", origin);

  return (
    <ThemeContext.Provider value={{ theme, pref, toggle, setTheme, setPref }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

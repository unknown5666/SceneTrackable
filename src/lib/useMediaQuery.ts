import { useEffect, useState } from "react";

/** Subscribes to a CSS media query, so layout decisions React can't express in
 *  Tailwind classes (inline widths, which tree to render) still follow the
 *  same breakpoints. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind's `lg` — below this the sidebar is an overlay. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");

/** Tailwind's `xl` — below this the dashboard drops to a single column. */
export const useIsWide = () => useMediaQuery("(min-width: 1280px)");

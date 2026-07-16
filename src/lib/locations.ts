import { useMemo } from "react";
import { useStore } from "@/state/store";

/**
 * Every location name the production already knows about, de-duplicated and
 * sorted. Sources: scene headings, shoot days, breakdown elements tagged
 * `locations`, and any location that has a lock date.
 */
export function useLocationNames(): string[] {
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const locationLockDates = useStore((s) => s.locationLockDates);

  return useMemo(() => {
    const names = new Set<string>();
    const add = (v?: string) => {
      const t = (v ?? "").trim();
      if (t) names.add(t);
    };

    for (const s of scenes) {
      add(s.location);
      for (const el of s.elements) {
        if (el.category === "locations") add(el.name);
      }
    }
    for (const d of shootDays) add(d.location);
    for (const k of Object.keys(locationLockDates ?? {})) add(k);

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [scenes, shootDays, locationLockDates]);
}

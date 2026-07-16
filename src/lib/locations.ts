import { useMemo } from "react";
import { useStore } from "@/state/store";
import type { ProductionLocation, Scene } from "@/types";

/** Case/whitespace-insensitive key for matching location names across sources. */
export const locKey = (v: string): string => v.trim().toLowerCase();

/**
 * Every location name the production already knows about, de-duplicated and
 * sorted. Canonical names from the locations collection come first; the rest
 * are derived from scene headings, shoot days, breakdown elements tagged
 * `locations`, and any location holding a legacy lock date — so a dropdown
 * still offers a place the script mentions before anyone has recorded it.
 */
export function useLocationNames(): string[] {
  const locations = useStore((s) => s.locations);
  const scenes = useStore((s) => s.scenes);
  const shootDays = useStore((s) => s.shootDays);
  const locationLockDates = useStore((s) => s.locationLockDates);

  return useMemo(() => {
    const canonical: string[] = [];
    const derived = new Set<string>();
    const seen = new Set<string>();

    const addCanonical = (v?: string) => {
      const t = (v ?? "").trim();
      if (!t || seen.has(locKey(t))) return;
      seen.add(locKey(t));
      canonical.push(t);
    };
    const addDerived = (v?: string) => {
      const t = (v ?? "").trim();
      if (!t || seen.has(locKey(t))) return;
      seen.add(locKey(t));
      derived.add(t);
    };

    for (const l of locations ?? []) addCanonical(l.name);

    for (const s of scenes) {
      addDerived(s.location);
      for (const el of s.elements) {
        if (el.category === "locations") addDerived(el.name);
      }
    }
    for (const d of shootDays) addDerived(d.location);
    for (const k of Object.keys(locationLockDates ?? {})) addDerived(k);

    canonical.sort((a, b) => a.localeCompare(b));
    return [...canonical, ...Array.from(derived).sort((a, b) => a.localeCompare(b))];
  }, [locations, scenes, shootDays, locationLockDates]);
}

/**
 * The lock dates every `location_lock(...)` deadline resolves against.
 *
 * Location records are the source of truth; the legacy `locationLockDates` map
 * is the fallback so data recorded before the collection existed still moves
 * deadlines. Aliases resolve to their location's date, which is what lets a
 * rule written against the script's spelling survive a rename.
 */
export function resolveLockDates(
  locations: ProductionLocation[] | undefined,
  legacy: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, date] of Object.entries(legacy ?? {})) {
    if (date) out[locKey(name)] = date;
  }
  for (const l of locations ?? []) {
    if (!l.lockDate) continue;
    out[locKey(l.name)] = l.lockDate;
    for (const a of l.aliases ?? []) out[locKey(a)] = l.lockDate;
  }
  return out;
}

/** Does this scene play at this location, by canonical name or alias? */
export function sceneMatchesLocation(scene: Scene, loc: ProductionLocation): boolean {
  const names = [loc.name, ...(loc.aliases ?? [])].map(locKey);
  return names.includes(locKey(scene.location));
}

/** Scenes that play at a location, by canonical name or alias. */
export function scenesAtLocation(scenes: Scene[], loc: ProductionLocation): Scene[] {
  return scenes.filter((s) => sceneMatchesLocation(s, loc));
}

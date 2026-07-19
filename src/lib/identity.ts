// ============================================================
// IDENTITY GRADIENTS
//
// Deterministic 2-hue gradients from a string id, used for identity avatars
// (users, cast, crew) and auto-generated project "posters". Same id → same
// gradient everywhere (TopBar, presence, tasks, activity, DOOD, Projects).
// ============================================================

/** A stable 32-bit hash of a string (FNV-1a). */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Gradient {
  from: string;
  to: string;
  /** Ready-to-use CSS `linear-gradient(...)`. */
  css: string;
  /** Angle in degrees. */
  angle: number;
}

/**
 * Two harmonious hues (~40–80° apart) from the id hash, at fixed saturation and
 * lightness so text stays legible on top and light/dark both read well.
 */
export function gradientFor(id: string, opts?: { sat?: number; light?: number }): Gradient {
  const h = hash(id || "seed");
  const hue1 = h % 360;
  const spread = 40 + ((h >> 9) % 45); // 40–85°
  const hue2 = (hue1 + spread) % 360;
  const angle = 90 + ((h >> 17) % 180); // 90–270°
  const s = opts?.sat ?? 62;
  const l = opts?.light ?? 55;
  const from = `hsl(${hue1} ${s}% ${l}%)`;
  const to = `hsl(${hue2} ${s}% ${Math.max(30, l - 12)}%)`;
  return { from, to, angle, css: `linear-gradient(${angle}deg, ${from}, ${to})` };
}

/** Up to two initials from a display name / label. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

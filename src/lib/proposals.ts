// ============================================================
// AI PROPOSALS → RECORDS
//
// The rule everywhere in the app: AI output is a proposal the user reviews and
// accepts, never a silent write. These helpers do the two jobs every proposal
// surface needs — work out what already exists (so it can be shown but not
// re-created) and turn an accepted proposal into a record.
// ============================================================

import type {
  CastMember,
  ProductionLocation,
  Scene,
  ScriptCharacter,
} from "@/types";
import type { ProposedLocation } from "@/lib/claude";
import { locKey } from "@/lib/locations";

// ------------------------------------------------------------
// Locations
// ------------------------------------------------------------

/** Every name a location answers to, normalized. */
const locationNames = (l: { name: string; aliases?: string[] }): string[] =>
  [l.name, ...(l.aliases ?? [])].map(locKey).filter(Boolean);

/** Does this proposal name a location the production already has? */
export function locationExists(
  proposal: ProposedLocation,
  existing: ProductionLocation[]
): ProductionLocation | undefined {
  const wanted = new Set(locationNames(proposal));
  return existing.find((e) => locationNames(e).some((n) => wanted.has(n)));
}

/** An accepted location proposal as a record, ready for `addRecord`. */
export function locationFromProposal(
  p: ProposedLocation
): Omit<ProductionLocation, "id"> {
  return {
    name: p.name,
    aliases: p.aliases?.length ? p.aliases : undefined,
    type: p.type,
    permitStatus: "scouting",
    notes: p.suggestedNotes,
    createdByAI: true,
  };
}

/** Scenes a proposal claims, resolved to the app's scene records. */
export function scenesForProposal(p: ProposedLocation, scenes: Scene[]): Scene[] {
  const names = new Set(locationNames(p));
  const numbers = new Set((p.sceneNumbers ?? []).map((n) => n.trim()));
  return scenes.filter(
    (s) => numbers.has(s.number) || names.has(locKey(s.location))
  );
}

// ------------------------------------------------------------
// Cast
// ------------------------------------------------------------

/** Every name a character answers to, normalized. */
const characterNames = (c: { name: string; aliases?: string[] }): string[] =>
  [c.name, ...(c.aliases ?? [])].map((n) => n.trim().toLowerCase()).filter(Boolean);

/** Is this character already on the cast list, by character name or alias? */
export function characterExists(
  character: ScriptCharacter,
  cast: CastMember[]
): CastMember | undefined {
  const wanted = new Set(characterNames(character));
  return cast.find(
    (c) => wanted.has(c.role.trim().toLowerCase()) || wanted.has(c.name.trim().toLowerCase())
  );
}

/** Story importance -> the contract category a cast list actually uses. */
export function castCategoryFor(c: ScriptCharacter): CastMember["category"] {
  switch (c.importance) {
    case "lead":
      return "lead";
    case "supporting":
      return "supporting";
    default:
      return "day_player";
  }
}

/**
 * Scene ids a character appears in — matched against the cast elements the
 * breakdown tagged, falling back to the script text. Word-boundary matched, so
 * "AL" doesn't claim every scene containing "always".
 */
export function scenesForCharacter(c: ScriptCharacter, scenes: Scene[]): string[] {
  const names = characterNames(c);
  const patterns = names.map(
    (n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
  );
  return scenes
    .filter((s) => {
      const castElements = s.elements.filter((e) => e.category === "cast");
      if (castElements.some((e) => names.includes(e.name.trim().toLowerCase()))) return true;
      // No breakdown elements yet (or the name isn't among them) — the script
      // text is the only other evidence the character is in this scene.
      return patterns.some((re) => re.test(s.scriptText));
    })
    .map((s) => s.id);
}

/** An accepted character as a cast record, ready for `addCastMember`. */
export function castFromCharacter(
  c: ScriptCharacter,
  scenes: Scene[]
): Omit<CastMember, "id"> {
  return {
    // No actor is attached yet: the character name is the honest placeholder
    // until someone is booked.
    name: c.name,
    role: c.name,
    category: castCategoryFor(c),
    scenes: scenesForCharacter(c, scenes),
    ratePerDay: 0,
  };
}

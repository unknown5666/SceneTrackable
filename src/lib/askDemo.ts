// ============================================================
// "ASK THE PRODUCTION" — demo-mode answering
//
// With no API key there is no model to reason with, so this does the one thing
// a keyword lookup can do honestly: find the records the question names and
// show them. It never phrases a guess as an answer, and it always says it is
// demo mode.
// ============================================================

import type { ProductionData } from "@/types";
import { scenesAtLocation } from "@/lib/locations";

const DEMO_NOTE =
  "(Offline fallback — this is a keyword lookup over your data, not an AI answer. It appears only when the AI service couldn't be reached.)";

/** Words too common to identify a record. */
const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "what", "which", "who", "whom", "whose",
  "when", "where", "why", "how", "is", "in", "on", "at", "to", "of", "a", "an", "do",
  "does", "did", "with", "from", "by", "my", "our", "we", "i", "it", "that", "this",
  "have", "has", "had", "will", "can", "any", "all", "much", "many", "days", "day",
  "scene", "scenes", "set", "left", "unspent", "spent", "s",
]);

const terms = (q: string): string[] =>
  q
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

export function demoAnswer(question: string, d: ProductionData): string {
  const words = terms(question);
  if (words.length === 0) {
    return `Ask about a cast member, a location, a scene, a department or a budget line. ${DEMO_NOTE}`;
  }

  const hits: string[] = [];
  const matches = (haystack: string) => {
    const h = haystack.toLowerCase();
    return words.some((w) => h.includes(w));
  };

  // ---- Cast: which days is X on? ----
  for (const c of d.cast) {
    if (!matches(`${c.name} ${c.role}`)) continue;
    const days = Object.entries(d.dood[c.id] ?? {})
      .filter(([, s]) => s !== "OFF")
      .map(([day, s]) => `Day ${day} (${s})`);
    const sceneNums = d.scenes
      .filter((s) => c.scenes.includes(s.id))
      .map((s) => s.number);
    hits.push(
      `${c.name} — ${c.role}, ${c.category.replace("_", " ")}. ${
        days.length ? `Scheduled: ${days.join(", ")}.` : "No DOOD days set."
      } ${sceneNums.length ? `Scenes: ${sceneNums.join(", ")}.` : "No scenes linked."}`
    );
  }

  // ---- Locations ----
  for (const loc of d.locations) {
    if (!matches(`${loc.name} ${(loc.aliases ?? []).join(" ")}`)) continue;
    const at = scenesAtLocation(d.scenes, loc);
    hits.push(
      `${loc.name} — ${loc.type}, ${loc.permitStatus.replace(/_/g, " ")}${
        loc.lockDate ? `, locks ${loc.lockDate.slice(0, 10)}` : ""
      }. ${at.length} scene${at.length === 1 ? "" : "s"}${
        at.length ? `: ${at.map((s) => s.number).join(", ")}` : ""
      }.`
    );
  }

  // ---- Budget ----
  for (const line of d.budgetLines) {
    if (!matches(`${line.code} ${line.description} ${line.category} ${line.department ?? ""}`))
      continue;
    hits.push(
      `${line.code} ${line.description} — budgeted ${line.budgeted}, spent ${line.spent}, remaining ${
        line.budgeted - line.spent
      } ${d.production.currency}.`
    );
  }

  // ---- Scenes by location ----
  for (const s of d.scenes) {
    if (!matches(s.location)) continue;
    hits.push(`Scene ${s.number} — ${s.intExt}. ${s.location} — ${s.timeOfDay}, ${s.pages} pages.`);
    if (hits.length > 24) break;
  }

  if (hits.length === 0) {
    return `Nothing in the production data matches “${words.join(
      " "
    )}”. ${DEMO_NOTE}`;
  }

  const shown = hits.slice(0, 12);
  return `${shown.join("\n")}${
    hits.length > shown.length ? `\n…and ${hits.length - shown.length} more matches.` : ""
  }\n\n${DEMO_NOTE}`;
}

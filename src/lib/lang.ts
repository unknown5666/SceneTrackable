// ============================================================
// SCRIPT LANGUAGE — detection and the Arabic vocabulary
//
// One place decides whether the material in front of us is Arabic, so the
// filter labels, the scene list and the AI prompts can never disagree about
// it. Scene fields stay canonical English ("INT", "NIGHT") wherever they are
// stored, compared or exported — Arabic is a display concern only, applied at
// the edge. Translating the stored value instead would break every filter
// predicate, the schedule and the CSV export at once.
// ============================================================

import type { Scene } from "@/types";

export type ScriptLanguage = "ar" | "en";

/**
 * Arabic letters: the base block, Arabic Supplement, Extended-A, and the
 * presentation forms some PDF extractors emit instead of base letters.
 *
 * The ranges, since the literals are unreadable:
 *   U+0620–U+064A  base letters      U+0671–U+06D3  extended base letters
 *   U+0750–U+077F  Arabic Supplement U+08A0–U+08FF  Extended-A
 *   U+FB50–U+FDFF  Presentation-A    U+FE70–U+FEFC  Presentation-B
 *
 * Two exclusions are deliberate and easy to undo by accident:
 *   - Arabic-Indic digits (U+0660–U+0669) are absent. They aren't letters, and
 *     a scene number alone must not make a script Arabic — `hasArabic` is used
 *     to assert AI output is Arabic prose, which a bare "١٢" would satisfy.
 *   - Presentation-B stops at U+FEFC, not U+FEFF: the byte-order mark sits at
 *     the top of that block, and including it reads a BOM in an English file
 *     as Arabic.
 */
const ARABIC_LETTER =
  /[ؠ-يٱ-ۓݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;

const ARABIC_LETTER_G = new RegExp(ARABIC_LETTER.source, "g");
const LATIN_LETTER_G = /[A-Za-z]/g;

/** True if the text contains any Arabic at all. */
export function hasArabic(text: string): boolean {
  return ARABIC_LETTER.test(text);
}

/**
 * Which language a body of text is *in*, by which alphabet carries it.
 *
 * A mixed script is the normal case, not the exception: Arabic screenplays
 * routinely keep English for department names, technical terms and title
 * cards. So the test is which alphabet dominates, not whether Arabic appears —
 * a stray "INT." or a crew credit must not flip an Arabic script to English,
 * and one Arabic proper noun must not flip an English one to Arabic.
 */
export function detectLanguage(text: string): ScriptLanguage {
  const arabic = text.match(ARABIC_LETTER_G)?.length ?? 0;
  const latin = text.match(LATIN_LETTER_G)?.length ?? 0;
  return arabic > latin ? "ar" : "en";
}

/** The language of an imported script, judged from its headings and action. */
export function sceneLanguage(scenes: Scene[]): ScriptLanguage {
  if (scenes.length === 0) return "en";
  // Sampling the location line as well as the body keeps a script whose action
  // is sparse (a montage, a title sequence) from reading as English.
  const sample = scenes.map((s) => `${s.location} ${s.scriptText}`).join("\n");
  return detectLanguage(sample);
}

// ------------------------------------------------------------
// Arabic vocabulary for the canonical scene fields
// ------------------------------------------------------------

export const INT_EXT_AR: Record<Scene["intExt"], string> = {
  INT: "داخلي",
  EXT: "خارجي",
  "INT/EXT": "داخلي/خارجي",
};

export const TIME_OF_DAY_AR: Record<Scene["timeOfDay"], string> = {
  DAY: "نهار",
  NIGHT: "ليل",
  DAWN: "فجر",
  DUSK: "غروب",
};

/**
 * Filter-toolbar chrome. Both languages are spelled out in one shape so a new
 * string can't be added to one and silently fall back to English in the other.
 *
 * This is not an i18n framework and shouldn't grow into one — it is the
 * vocabulary of the scene filters, which follow the script's language because
 * the values they list (locations, cast) come out of the script itself. An
 * Arabic dropdown of Arabic locations under an English label reads as a bug.
 */
interface FilterStrings {
  filters: string;
  intExt: string;
  timeOfDay: string;
  location: string;
  cast: string;
  shootDate: string;
  clearAll: string;
  noMatch: string;
  scenes: (shown: number, total: number, filtered: boolean) => string;
}

export const FILTER_STRINGS: Record<ScriptLanguage, FilterStrings> = {
  en: {
    filters: "Filters",
    intExt: "INT/EXT",
    timeOfDay: "Time of day",
    location: "Location",
    cast: "Cast",
    shootDate: "Shoot date",
    clearAll: "Clear all",
    noMatch: "No scenes match these filters.",
    scenes: (shown, total, filtered) =>
      filtered ? `${shown} of ${total} scenes` : `${total} scenes`,
  },
  ar: {
    filters: "الفلاتر",
    intExt: "داخلي/خارجي",
    timeOfDay: "الوقت",
    location: "الموقع",
    cast: "الممثلون",
    shootDate: "يوم التصوير",
    clearAll: "مسح الكل",
    noMatch: "لا توجد مشاهد مطابقة لهذه الفلاتر.",
    scenes: (shown, total, filtered) =>
      filtered ? `${shown} من ${total} مشهد` : `${total} مشهد`,
  },
};

/** `INT` → `داخلي` for display; unknown values pass through untouched. */
export function intExtLabel(value: string, lang: ScriptLanguage): string {
  return lang === "ar" ? INT_EXT_AR[value as Scene["intExt"]] ?? value : value;
}

export function timeOfDayLabel(value: string, lang: ScriptLanguage): string {
  return lang === "ar" ? TIME_OF_DAY_AR[value as Scene["timeOfDay"]] ?? value : value;
}

// ------------------------------------------------------------
// AI
// ------------------------------------------------------------

/**
 * What to tell a model about the language it must answer in.
 *
 * Left to itself a model reading an Arabic script answers in English — it
 * translates the cast names and the props, so the breakdown no longer matches
 * the script the crew is holding and the AI's character names no longer join
 * up with the parser's. The split matters: prose is the crew's to read, but
 * every enum and key is a stored value the app matches on, and translating
 * those silently produces a breakdown with no valid categories.
 */
export function languageDirective(lang: ScriptLanguage): string {
  if (lang !== "ar") return "";
  return `
LANGUAGE — this screenplay is in Arabic.
- Write every human-readable value in Arabic: names, descriptions, notes, synopses, summaries.
- Name characters, locations and props exactly as the script writes them. Do not transliterate them into Latin script and do not translate them into English — the crew reads these off the script, and the app matches them back to it by name.
- Keep JSON keys, and every value the schema constrains to a fixed list (category, importance, INT/EXT, time of day, department), in English exactly as the schema spells them. These are identifiers, not prose. Translating them makes the answer unusable.
- Keep scene numbers in ASCII digits.`;
}

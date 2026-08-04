// ============================================================
// TREATMENT / PITCH → A PRODUCTION PROFILE
//
// Long before there is a script there is a treatment: a few pages of format,
// characters, locations and story that a producer has already written and can
// paste in. Everything a first-pass budget needs is in there — how many
// episodes, how long they run, how many people speak, whether anyone throws a
// punch — but written as prose, not as fields.
//
// This module reads that prose into a `TreatmentProfile`: counts, names and a
// set of 0–3 *load* scores for the things that actually move money (action,
// stunts, VFX, crowd, period, aerial, water, night). The profile then seeds the
// estimate's assumptions (`lib/budgetEstimate.ts`), which do the arithmetic.
//
// Two rules shape it:
//
//   - **Nothing here is money.** This file never produces a figure. It produces
//     the counts a rate card is applied to, so a wrong reading is one number
//     the user corrects in the assumptions panel, not a budget quietly built on
//     a hallucination.
//   - **Everything is evidenced.** Each field records the line it came from in
//     `evidence`, so the review screen can show *why* it says 12 episodes.
//
// Pure text in, profile out — no DOM, no store — so `scripts/estimate-test.ts`
// can run it over a real treatment from plain Node.
// ============================================================

import { detectLanguage, type ScriptLanguage } from "@/lib/lang";
import { foldArabic, toAsciiDigits } from "@/lib/budgetImport";

// ------------------------------------------------------------
// Shape
// ------------------------------------------------------------

export type Billing = "lead" | "supporting" | "day_player";

/**
 * The production loads a budget is sensitive to, each scored 0–3.
 *
 * These are the axes where two otherwise identical dramas cost very different
 * money: a boxing series needs stunt days, a second camera and SFX makeup; a
 * two-hander in one flat needs none of it. Scoring them 0–3 rather than
 * true/false is what lets the rate card scale rather than switch.
 */
export interface TreatmentLoads {
  action: number;
  stunts: number;
  vfx: number;
  crowd: number;
  period: number;
  aerial: number;
  water: number;
  night: number;
}

export const LOAD_KEYS = [
  "action",
  "stunts",
  "vfx",
  "crowd",
  "period",
  "aerial",
  "water",
  "night",
] as const;

export const LOAD_LABELS: Record<keyof TreatmentLoads, { en: string; ar: string }> = {
  action: { en: "Action / fights", ar: "أكشن ومعارك" },
  stunts: { en: "Stunts & falls", ar: "مخاطر وحركات خطرة" },
  vfx: { en: "VFX / graphics", ar: "مؤثرات بصرية" },
  crowd: { en: "Crowds & extras", ar: "حشود وكومبارس" },
  period: { en: "Period / two eras", ar: "زمن سابق / خطين زمنيين" },
  aerial: { en: "Aerial / drone", ar: "تصوير جوي" },
  water: { en: "Water / marine", ar: "تصوير مائي" },
  night: { en: "Night shooting", ar: "تصوير ليلي" },
};

export interface TreatmentCharacter {
  name: string;
  billing: Billing;
  /** The descriptive line under the name, kept so the reviewer can sanity-check. */
  note?: string;
}

export interface TreatmentLocation {
  name: string;
  note?: string;
}

export interface TreatmentProfile {
  title?: string;
  format: "series" | "film";
  /** 1 for a feature. */
  episodes: number;
  episodeMinutes: number;
  genres: string[];
  characters: TreatmentCharacter[];
  locations: TreatmentLocation[];
  loads: TreatmentLoads;
  language: ScriptLanguage;
  /** What in the text produced the numbers above, one line each. */
  evidence: string[];
}

// ------------------------------------------------------------
// Section headings
//
// A treatment is a stack of short titled blocks («الشخصيات», «الحلقات»,
// "CHARACTERS"). Knowing where a block *ends* matters as much as where it
// starts: the bullet list under «الموسيقى» is music cues, and reading it as
// locations because it follows «معالم أبوظبي» would put "orchestral score" on
// the location list. So every extractor slices between its own heading and the
// next heading of any kind.
// ------------------------------------------------------------

type SectionKind =
  | "title"
  | "logline"
  | "story"
  | "characters"
  | "locations"
  | "episodes"
  | "music"
  | "action"
  | "romance"
  | "message"
  | "incident"
  | "other";

const SECTION_HEADINGS: { kind: SectionKind; ar: string[]; en?: RegExp }[] = [
  { kind: "characters", ar: ["الشخصيات", "الابطال", "شخصيات العمل"], en: /^(?:characters?|the cast|dramatis)/i },
  {
    kind: "locations",
    ar: ["معالم", "المواقع", "مواقع التصوير", "اماكن التصوير", "الاماكن"],
    en: /^(?:locations?|settings?|shooting locations)/i,
  },
  { kind: "episodes", ar: ["الحلقات", "ملخص الحلقات"], en: /^(?:episodes?|episode (?:guide|breakdown))/i },
  { kind: "music", ar: ["الموسيقى", "الموسيقي", "الاغاني"], en: /^(?:music|score|songs)/i },
  { kind: "action", ar: ["الاكشن", "المشاهد الخطرة"], en: /^(?:action|stunts?)/i },
  { kind: "romance", ar: ["الرومانسيه", "الرومانسية"], en: /^(?:romance)/i },
  { kind: "message", ar: ["الرساله", "الرسالة", "الفكره", "الفكرة"], en: /^(?:message|theme|premise)/i },
  { kind: "incident", ar: ["الحادث", "الحادثه"], en: /^(?:the incident)/i },
  { kind: "story", ar: ["القصه", "القصة", "الملخص", "الحبكه"], en: /^(?:story|synopsis|logline|premise)/i },
  { kind: "logline", ar: ["الشعار"], en: /^(?:tagline|logline)/i },
];

/**
 * A separator rule the writer typed, in any of the forms writers actually use.
 *
 * The two-em dash «⸻» that Arabic treatments separate blocks with is ONE
 * character, not a run of them, so a length-3 rule never sees it — and missing
 * it costs the whole character section, which then has to be split on blank
 * lines and starts reading sentences as names. Dedicated rule glyphs count on
 * their own; ambiguous ASCII (`-`, `*`, `_`) needs three, because a single `*`
 * is a bullet.
 */
const SEPARATOR_RE = /^\s*(?:[⸻━─═—–]+|[-_*=~·•]{3,})\s*$/;

function headingKind(line: string): SectionKind | null {
  // A heading is a short line. A sentence containing «الحلقات» in the middle of
  // a paragraph is prose, not the episode block opening.
  const bare = line.replace(/[:：.،,]/g, "").trim();
  if (!bare || bare.length > 40) return null;
  const folded = foldArabic(bare);
  for (const h of SECTION_HEADINGS) {
    if (h.ar.some((k) => folded === foldArabic(k) || folded.startsWith(foldArabic(k)))) return h.kind;
    if (h.en?.test(bare)) return h.kind;
  }
  return null;
}

/** The lines belonging to a section, from its heading to the next heading. */
function sectionLines(lines: string[], kind: SectionKind): string[] {
  const start = lines.findIndex((l) => headingKind(l) === kind);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (headingKind(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

// ------------------------------------------------------------
// Labelled fields — «عدد الحلقات: 10-12»
// ------------------------------------------------------------

/**
 * The number a labelled line states, with a range read as its midpoint.
 *
 * A treatment states intentions, not decisions: "10-12 episodes", "35–45
 * minutes". The midpoint is the honest single number to start a budget from —
 * the bottom of the range under-budgets and the top over-budgets, and both are
 * one edit away in the review panel. `rangeNote` carries the original span so
 * the reviewer sees what was written rather than only what was chosen.
 */
function labelledNumber(
  lines: string[],
  arKeys: string[],
  en: RegExp
): { value: number; raw: string } | null {
  for (const line of lines) {
    const folded = foldArabic(line);
    const hit = arKeys.some((k) => folded.includes(foldArabic(k))) || en.test(line);
    if (!hit) continue;
    const digits = toAsciiDigits(line);
    const range = digits.match(/(\d{1,4})\s*[-–—‑to]+\s*(\d{1,4})/i);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      // A "1990 ↔ 2026" line is two eras, not a range of episodes — a pair of
      // years is never a count, so it is left to the period detector.
      if (lo > 1900 || hi > 1900) continue;
      return { value: Math.ceil((lo + hi) / 2), raw: line.trim() };
    }
    const single = digits.match(/(\d{1,4})/);
    if (single && Number(single[1]) < 1900) {
      return { value: Number(single[1]), raw: line.trim() };
    }
  }
  return null;
}

// ------------------------------------------------------------
// Loads — what the story asks the unit to do
// ------------------------------------------------------------

const LOAD_KEYWORDS: Record<keyof TreatmentLoads, { ar: string[]; en: RegExp }> = {
  action: {
    ar: ["ملاكمه", "نزال", "حلبه", "اكشن", "هوشه", "ضربه", "ضرابه", "مطارده", "قتال", "عراك", "سباق"],
    en: /\b(?:action|fight|boxing|ring|chase|race|brawl|combat|battle)\b/i,
  },
  stunts: {
    ar: ["حادث", "سقوط", "اصابه", "خطر", "انفجار", "حريق", "مطارده", "دهس"],
    en: /\b(?:stunt|crash|fall|explosion|fire|injur|accident|wreck)\b/i,
  },
  vfx: {
    ar: ["مؤثرات بصريه", "جرافيكس", "خدع", "شاشه خضرا", "رسوم"],
    en: /\b(?:VFX|CGI|visual effects?|green ?screen|graphics|animation|composit)\b/i,
  },
  crowd: {
    ar: ["جمهور", "حشد", "كومبارس", "بطوله", "بطولات", "مباراه", "استاد", "سوق", "مهرجان"],
    en: /\b(?:crowd|stadium|arena|audience|extras|championship|tournament|festival|market)\b/i,
  },
  period: {
    ar: ["الالفينات", "التسعينات", "الماضي", "الطفوله", "زمن", "قديم", "تراث"],
    en: /\b(?:period|flashback|decades?|childhood|the past|era)\b/i,
  },
  aerial: {
    ar: ["جوي", "درون", "طياره", "هليكوبتر", "من الاعلى", "بانوراما"],
    en: /\b(?:aerial|drone|helicopter|bird'?s eye|flyover)\b/i,
  },
  water: {
    ar: ["بحر", "شاطئ", "مارينا", "ميناء", "قارب", "سفينه", "غوص", "مسبح", "قرم"],
    en: /\b(?:sea|beach|marina|harbou?r|boat|yacht|dive|pool|mangrove|underwater)\b/i,
  },
  night: {
    ar: ["ليل", "ليله", "ليلا", "مساء", "الفجر"],
    en: /\b(?:night|midnight|dusk|dawn|evening)\b/i,
  },
};

/** Hits → a 0–3 load. Deliberately coarse: it seeds a number the user edits. */
function scoreFromHits(hits: number): number {
  if (hits === 0) return 0;
  if (hits <= 2) return 1;
  if (hits <= 5) return 2;
  return 3;
}

function countHits(text: string, folded: string, spec: { ar: string[]; en: RegExp }): number {
  let hits = 0;
  for (const k of spec.ar) {
    const needle = foldArabic(k);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      hits++;
      from = at + needle.length;
      if (hits > 12) return hits;
    }
  }
  const en = text.match(new RegExp(spec.en.source, "gi"));
  return hits + (en?.length ?? 0);
}

/**
 * Years named in the text → how much of a period piece this is.
 *
 * Two distinct eras more than a decade apart is the expensive case, and the one
 * treatments state plainly ("1990 ↔ 2026", "الماضي يشرح الحاضر"): it doubles the
 * wardrobe, the dressing and the picture vehicles, because both worlds have to
 * be built. One old era is a period piece; only the present day is free.
 */
function periodFromYears(text: string): { score: number; note?: string } {
  const now = new Date().getFullYear();
  const years = [...toAsciiDigits(text).matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1900 && y <= now + 10);
  if (years.length === 0) return { score: 0 };
  const distinct = [...new Set(years)].sort((a, b) => a - b);
  const oldest = distinct[0];
  const newest = distinct[distinct.length - 1];
  if (now - oldest < 10) return { score: 0 };
  if (newest - oldest >= 10) {
    return { score: 3, note: `Two eras named — ${oldest} and ${newest} — so both worlds get dressed.` };
  }
  return { score: 2, note: `Set in ${oldest}, ${now - oldest} years back.` };
}

// ------------------------------------------------------------
// Characters
// ------------------------------------------------------------

/**
 * Words that describe a part rather than name one.
 *
 * A character block is usually «سالم» then «البطل» — name, then role. Both are
 * short lines, so without this list the role line becomes a second character
 * and the cast count (which prices the cast section) comes out double.
 */
const ROLE_WORDS_AR = [
  "البطل", "بطل", "البطله", "بطله", "الشرير", "الخصم", "الصديق", "الصديقه",
  "الاب", "الام", "الابن", "الابنه", "الاخ", "الاخت", "الزوج", "الزوجه",
  "المدرب", "الطبيب", "الشرطي", "العم", "الجد",
];
const ROLE_WORDS_EN =
  /^(?:the )?(?:hero(?:ine)?|lead|protagonist|antagonist|villain|best friend|friend|father|mother|son|daughter|brother|sister|wife|husband|coach|doctor|cop)\b/i;

const LEAD_MARKERS_AR = ["البطل", "بطل العمل", "بطله", "الشرير", "الخصم الرئيسي"];
const LEAD_MARKERS_EN = /\b(?:lead|protagonist|antagonist|villain|main character|our hero)\b/i;

function isRoleWord(name: string): boolean {
  const folded = foldArabic(name);
  return ROLE_WORDS_AR.some((w) => folded === foldArabic(w)) || ROLE_WORDS_EN.test(name);
}

/** A plausible character name: short, no digits, not a role word or sentence. */
function nameLike(line: string): boolean {
  const t = line.replace(/^[\s*•·\-–—]+/, "").trim().replace(/[:：.،,]+$/, "");
  if (!t || t.length > 34) return false;
  if (/\d/.test(toAsciiDigits(t))) return false;
  const words = t.split(/\s+/);
  if (words.length > 4) return false;
  if (/[.!?؟]/.test(t)) return false;
  return /\p{L}{2,}/u.test(t) && !isRoleWord(t);
}

function cleanName(line: string): string {
  return line.replace(/^[\s*•·\-–—]+/, "").trim().replace(/[:：.،,]+$/, "").trim();
}

/**
 * The character section → a cast list with billing.
 *
 * Treatments separate one character from the next with a rule («⸻») or a blank
 * line, and open each block with the name. So the block, not the line, is the
 * unit: take the first name-shaped line of each block, and read the rest of the
 * block for whether this is a lead. Anything the block calls «البطل», «بطلة»,
 * a villain or an antagonist is a lead — an antagonist is a leading part and
 * carries a lead's day rate, whatever the story thinks of him.
 */
function extractCharacters(lines: string[], fullText: string): TreatmentCharacter[] {
  // The separator is the reliable boundary when the writer used one. Blank
  // lines are not: this style of treatment puts a blank line between every
  // sentence, so splitting on those makes each sentence its own "character"
  // and «يعمل في جهة حكومية» joins the cast. When there is a rule between
  // entries, only the rule counts.
  const hasRules = lines.some((l) => SEPARATOR_RE.test(l.trim()));
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const isBoundary = hasRules ? SEPARATOR_RE.test(line) : !line || SEPARATOR_RE.test(line);
    if (isBoundary) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    if (line) current.push(line);
  }
  if (current.length) blocks.push(current);

  const folded = foldArabic(fullText);
  /** How often a name is used elsewhere — a real part recurs, a sentence doesn't. */
  const mentions = (name: string): number => {
    const needle = foldArabic(name);
    if (needle.length < 2) return 0;
    let n = 0;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      n++;
      from = at + needle.length;
      if (n > 4) break;
    }
    return n;
  };

  const out: TreatmentCharacter[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const head = block[0];
    if (!head || !nameLike(head)) continue;
    const name = cleanName(head);
    // Without rules to lean on, only a short name that the treatment goes on
    // to use again survives — the story section is where a character earns
    // their place on the cast list.
    if (!hasRules && (name.split(/\s+/).length > 2 || mentions(name) < 2)) continue;
    const key = foldArabic(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const body = block.slice(1).join(" ");
    const foldedBody = foldArabic(body);
    const isLead =
      LEAD_MARKERS_AR.some((m) => foldedBody.includes(foldArabic(m))) || LEAD_MARKERS_EN.test(body);
    out.push({
      name,
      billing: isLead ? "lead" : "supporting",
      note: block[1]?.slice(0, 80),
    });
  }

  // Nothing marked as a lead means the treatment never used the word. The
  // first two named parts are the leads in practice, and a cast list with no
  // leads prices every speaking part at a supporting rate.
  if (out.length > 0 && !out.some((c) => c.billing === "lead")) {
    out.slice(0, 2).forEach((c) => (c.billing = "lead"));
  }
  return out.slice(0, 40);
}

// ------------------------------------------------------------
// Locations
// ------------------------------------------------------------

function extractLocations(lines: string[]): TreatmentLocation[] {
  const out: TreatmentLocation[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || SEPARATOR_RE.test(line)) continue;
    const stripped = line.replace(/^[\s*•·\-–—]+/, "").trim();
    if (!stripped || stripped.length > 60 || !/\p{L}{2,}/u.test(stripped)) continue;
    // «خلال الأحداث تظهر بشكل طبيعي:» introduces the list, it isn't in it.
    if (/[:：]$/.test(stripped)) continue;
    if (/[.!?؟]\s+\p{L}/u.test(stripped)) continue; // a sentence, not a place
    if (stripped.split(/\s+/).length > 6) continue;
    // Parentheticals come off first, then punctuation — «ليوا (معسكر
    // التدريب).(كيزاد)» is one place carrying two notes, and stripping the
    // trailing stop first would leave the period stranded mid-name.
    const notes = [...stripped.matchAll(/[（(]([^）)]{1,40})[）)]/g)].map((m) => m[1].trim());
    const name = stripped
      .replace(/[（(][^）)]*[）)]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s.،,؛;:]+$/, "")
      .trim();
    if (!name || !/\p{L}{2,}/u.test(name)) continue;
    const key = foldArabic(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, note: notes.join(" · ") || undefined });
  }
  return out.slice(0, 40);
}

// ------------------------------------------------------------
// Title, format, counts
// ------------------------------------------------------------

const SERIES_WORDS = ["مسلسل", "حلقات", "سلسله", "موسم"];
const FILM_WORDS = ["فيلم", "روائي", "قصير"];

function extractTitle(lines: string[]): string | undefined {
  for (const raw of lines.slice(0, 12)) {
    const line = raw.trim();
    if (!line || SEPARATOR_RE.test(line) || headingKind(line)) continue;
    const folded = foldArabic(line);
    const isLabel =
      SERIES_WORDS.some((w) => folded.startsWith(foldArabic(w))) ||
      FILM_WORDS.some((w) => folded.startsWith(foldArabic(w))) ||
      /^(?:series|film|feature|show|title)\b/i.test(line);
    if (isLabel) {
      // «مسلسل (ضرابة قبل )» — the title is what's left once the format word
      // and its brackets are taken off.
      const inner = line.match(/[（(]([^）)]+)[）)]/)?.[1];
      const rest = inner ?? line.replace(/^\s*\S+\s*/, "");
      const title = rest.replace(/[:：]/g, "").trim();
      if (title) return title;
    }
  }
  // No labelled line: the first substantial line is the title, which is how
  // most treatments open anyway.
  const first = lines.find((l) => l.trim() && !SEPARATOR_RE.test(l.trim()) && !headingKind(l));
  const t = first?.trim();
  return t && t.length <= 60 ? t.replace(/[（(].*[）)]/g, "").trim() : undefined;
}

function countEpisodeHeadings(lines: string[]): number {
  // «الحلقة الأولى» / «الحلقة 1» / "EPISODE 3" — one line each in the episode
  // block. Counting them cross-checks the stated count: a treatment that says
  // "10-12" but lists 12 has 12.
  let n = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 40) continue;
    const folded = foldArabic(line);
    if (folded.startsWith(foldArabic("الحلقه")) && folded.length > foldArabic("الحلقه").length + 1) n++;
    else if (/^episode\s+\d+/i.test(line)) n++;
  }
  return n;
}

// ------------------------------------------------------------
// The read
// ------------------------------------------------------------

export function parseTreatment(raw: string): TreatmentProfile {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const folded = foldArabic(text);
  const language = detectLanguage(text);
  const evidence: string[] = [];

  const title = extractTitle(lines);
  if (title) evidence.push(`Title read as “${title}”.`);

  const seriesHits = SERIES_WORDS.reduce(
    (n, w) => n + (folded.includes(foldArabic(w)) ? 1 : 0),
    /\b(?:series|season|episodes?)\b/i.test(text) ? 1 : 0
  );
  const filmHits = FILM_WORDS.reduce(
    (n, w) => n + (folded.includes(foldArabic(w)) ? 1 : 0),
    /\b(?:feature film|screenplay for a film)\b/i.test(text) ? 1 : 0
  );
  const format: "series" | "film" = seriesHits >= filmHits && seriesHits > 0 ? "series" : "film";

  const episodeLines = sectionLines(lines, "episodes");
  const listed = countEpisodeHeadings(episodeLines.length ? episodeLines : lines);
  const stated = labelledNumber(lines, ["عدد الحلقات", "الحلقات"], /\bepisodes?\b/i);
  let episodes = 1;
  if (format === "series") {
    episodes = Math.max(stated?.value ?? 0, listed, 1);
    if (stated) evidence.push(`Episode count from “${stated.raw}”.`);
    if (listed > 0) evidence.push(`${listed} episode headings listed in the treatment.`);
  }

  const duration = labelledNumber(
    lines,
    ["مده الحلقه", "مدة الحلقة", "زمن الحلقه", "مده الفيلم"],
    /\b(?:runtime|duration|episode length|running time)\b/i
  );
  const episodeMinutes = duration?.value ?? (format === "series" ? 45 : 100);
  if (duration) evidence.push(`Runtime from “${duration.raw}”.`);

  const genreLine = lines.find((l) => {
    const f = foldArabic(l);
    return f.startsWith(foldArabic("النوع")) || /^genres?\s*[:：]/i.test(l.trim());
  });
  const genres = genreLine
    ? genreLine
        .replace(/^[^:：]*[:：]/, "")
        .split(/[-–—,،/|]/)
        .map((g) => g.trim())
        .filter((g) => g.length > 1 && g.length < 24)
        .slice(0, 8)
    : [];

  const characters = extractCharacters(sectionLines(lines, "characters"), text);
  if (characters.length) {
    evidence.push(
      `${characters.length} named parts read from the characters section (${characters.filter((c) => c.billing === "lead").length} billed as leads).`
    );
  }

  const locations = extractLocations(sectionLines(lines, "locations"));
  if (locations.length) evidence.push(`${locations.length} places listed in the locations section.`);

  const loads = {} as TreatmentLoads;
  for (const key of LOAD_KEYS) {
    loads[key] = scoreFromHits(countHits(text, folded, LOAD_KEYWORDS[key]));
  }
  const period = periodFromYears(text);
  loads.period = Math.max(loads.period, period.score);
  if (period.note) evidence.push(period.note);

  const heavy = LOAD_KEYS.filter((k) => loads[k] >= 2);
  if (heavy.length) {
    evidence.push(`Heavy on: ${heavy.map((k) => LOAD_LABELS[k].en.toLowerCase()).join(", ")}.`);
  }

  return {
    title,
    format,
    episodes,
    episodeMinutes,
    genres,
    characters,
    locations,
    loads,
    language,
    evidence,
  };
}

/** True when a paste is long enough to be worth reading as a treatment. */
export function looksLikeTreatment(text: string): boolean {
  return text.trim().length >= 120;
}

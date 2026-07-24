// ============================================================
// PDF TEXT ITEMS → LINES
//
// Kept apart from `lib/pdf.ts` on purpose. That module reaches the pdf.js
// worker through Vite's `?url` suffix and so only loads under the bundler;
// this one is pure geometry, so a plain-Node repro can run the same
// reconstruction the app runs instead of a copy of it (see
// scripts/arabic-pdf-repro.ts).
//
// A PDF has no lines and no words — only glyph runs at coordinates. Rebuilding
// text means grouping runs by baseline and then ordering them across the line,
// and "stream order" is not that order: an Arabic PDF commonly emits its runs
// in visual order, so concatenating them scrambles the words (داخلي arrives as
// يداخل). Position is the only reliable signal, which is why every decision
// here is made from `transform` rather than from the order items arrive in.
// ============================================================

/** The parts of a pdf.js `TextItem` this module needs. */
export interface PdfTextItemLike {
  str: string;
  /** pdf.js marks each run "rtl" or "ltr"; absent in synthetic fixtures. */
  dir?: string;
  width?: number;
  height?: number;
  /** [a, b, c, d, x, y] — index 4 is the run's left edge, 5 its baseline. */
  transform: number[];
}

/** Baselines within this many units are the same line. */
const Y_TOLERANCE = 4;

/**
 * A gap wider than this fraction of the font size is a word break. Generous:
 * glyph runs inside a word sit flush, so anything visibly open is a space, and
 * erring towards a space beats gluing two words into one token the parser can
 * never match.
 */
const SPACE_RATIO = 0.2;

/** A run's mean glyph advance, as a fraction of the font size. */
const AVG_CHAR_WIDTH = 0.45;

// Artifacts of glyphs with no ToUnicode mapping (U+0002 shows up throughout
// the Saudi drama PDF). They are not text and must not reach the parser.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Arabic short vowels — fatha, damma, kasra, sukun, shadda, superscript alef.
 *
 * Dropped, because this PDF vocalizes the same word inconsistently: one heading
 * reads مكتب and the next مًكتب, one راشد and the next راشّد. Arabic is normally
 * written without them, they carry nothing the breakdown needs, and keeping
 * them splits one location into two everywhere the app groups scenes by the
 * location string — the Locations page, the filters, `fallbackLocations`. Some
 * are mispositioned in the source besides (يوم is stored damma-then-ya), so
 * keeping them would render worse than dropping them.
 */
const ARABIC_HARAKAT = /[ً-ْٰ]/g;

const ARABIC_CHARS = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LATIN_CHARS = /[A-Za-z]/g;

/**
 * الله written backwards, as one run.
 *
 * The lam-lam-ha ligature is stored as a single glyph, and the Emirati PDF
 * emits its four characters in visual order *inside* the run — so they arrive
 * as هللا. Run reordering can't reach this: it orders runs and never reverses a
 * string, which is what keeps it from scrambling text that is already correct.
 *
 * Fixed here by name rather than by a general rule because this ligature is the
 * only one that has to be, and because the substitution is unambiguous: هللا is
 * not a word, while الله is one of the commonest in the language and sits
 * inside عبدالله — a lead character in this script, whose name would otherwise
 * reach the cast list, the DOOD and the call sheets misspelled.
 */
const ALLAH_VISUAL = /هللا/g;

/**
 * Tatweel — the kashida, U+0640.
 *
 * A stretching character with no phonetic value, used to justify a line or to
 * decorate a heading. The budget PDF sets its column titles with it, so «المجموع»
 * arrives as «الـمجـمـــــوع» and «الملاحظات» as «الـمـالحـظات». Nothing downstream
 * expects it and everything downstream matches words, so a decorated total row
 * would go unrecognized and a decorated label unmatched.
 */
const TATWEEL = /ـ/g;

/**
 * NFKC folds the Arabic presentation forms (U+FB50–U+FDFF, U+FE70–U+FEFC) that
 * some extractors emit back to base letters. This PDF happens to use base
 * letters already, but `HEADING_AR_RE` and `ARABIC_LETTER` are written against
 * base letters, so normalizing here is what keeps the other kind of Arabic PDF
 * from parsing to zero scenes.
 */
function clean(str: string): string {
  return str
    .normalize("NFKC")
    .replace(CONTROL_CHARS, "")
    .replace(ARABIC_HARAKAT, "")
    .replace(TATWEEL, "")
    .replace(ALLAH_VISUAL, "الله");
}

type Item = PdfTextItemLike & { str: string };

/**
 * How wide a run is on the page.
 *
 * pdf.js reports width 0 for the runs this PDF splits words across — the ones
 * that carried a diacritic — and a zero width reads as a run sitting entirely
 * to the left of where it really ends, which fakes a gap wide enough to look
 * like a word break and puts a space inside مكتب. There is no width to recover
 * at that point, so it's estimated from the glyph count instead; the estimate
 * only has to be good enough to tell an intra-word gap (~0) from a real space
 * (~3 and up at 12pt), and it is.
 */
function widthOf(it: Item): number {
  if (it.width && it.width > 0) return it.width;
  const size = Math.abs(it.transform[3]) || it.height || 10;
  return [...it.str].length * AVG_CHAR_WIDTH * size;
}

/**
 * Which way the line reads. `dir` alone isn't enough — pdf.js reports it per
 * run, and a line's punctuation, digits and scene number all come back "ltr" —
 * so the alphabet carrying the line decides, with `dir` as a nudge.
 */
function isRtlLine(items: Item[]): boolean {
  let arabic = 0;
  let latin = 0;
  for (const it of items) {
    arabic += it.str.match(ARABIC_CHARS)?.length ?? 0;
    latin += it.str.match(LATIN_CHARS)?.length ?? 0;
    if (it.dir === "rtl") arabic += 1;
  }
  return arabic > latin;
}

/**
 * A run's own reading direction: R for Arabic, L for digits and Latin, N for
 * runs that are only punctuation and so take their direction from whatever
 * surrounds them.
 */
type RunDir = "R" | "L" | "N";

/**
 * Whether two runs on the same line have visible space between them.
 *
 * Measured from whichever edge faces the other, so it holds in both directions
 * — a reversed LTR group reads its runs in ascending x inside a line whose runs
 * otherwise descend.
 */
function spaced(a: Item, b: Item): boolean {
  const gap = Math.max(
    a.transform[4] - (b.transform[4] + widthOf(b)),
    b.transform[4] - (a.transform[4] + widthOf(a))
  );
  const size = Math.abs(b.transform[3]) || b.height || 10;
  return gap > size * SPACE_RATIO;
}

// Non-global twin of ARABIC_CHARS: `test` on a /g regex carries `lastIndex`
// between calls, so reusing that one here would classify every other run wrong.
const ARABIC_CHAR = new RegExp(ARABIC_CHARS.source);

function runDir(str: string): RunDir {
  if (ARABIC_CHAR.test(str)) return "R";
  return /[0-9A-Za-z]/.test(str) ? "L" : "N";
}

/**
 * Embedded left-to-right stretches inside an RTL line, as index ranges into
 * the already-RTL-ordered run list.
 *
 * This is the one rule an x-sort alone cannot express. A number is laid out
 * left to right *inside* a right-to-left line, and this PDF emits its digits as
 * separate runs — "1" at x=497.9 and "0" at x=506.1 for scene 10 — so ordering
 * the whole line by descending x reads that number backwards and scene 10
 * becomes scene "01". Every multi-run number in the file is affected: 20,000
 * arrives as "000,20", and the scene numbers land so scrambled that the parser
 * sees duplicates and splits one script into phantom episodes.
 *
 * Punctuation between two LTR runs is part of the number, not a boundary —
 * without that the thousands comma would cut "20,000" into two groups that each
 * reverse to themselves and nothing would be fixed. Punctuation anywhere else
 * belongs to the surrounding Arabic and stays put.
 *
 * A visible gap ends the group even between two LTR runs, because two numbers
 * with space between them are two embeddings, not one. The budget table is the
 * case that proves it: its count column sits to the right of its amount column,
 * so "1" and "50,000" already arrive in reading order, and merging them would
 * swap every row's count with its money.
 */
function ltrGroups(items: Item[], dirs: RunDir[]): [number, number][] {
  const groups: [number, number][] = [];
  let start = -1;
  let pendingNeutrals = 0;

  const flush = (end: number) => {
    if (start >= 0 && end - pendingNeutrals > start) {
      groups.push([start, end - pendingNeutrals]);
    }
    start = -1;
    pendingNeutrals = 0;
  };

  for (let i = 0; i < items.length; i++) {
    const d = dirs[i];
    if (d === "R") {
      flush(i - 1);
      continue;
    }
    if (start >= 0 && spaced(items[i - 1], items[i])) flush(i - 1);
    if (d === "L") {
      if (start < 0) start = i;
      pendingNeutrals = 0;
    } else if (start >= 0) {
      // A neutral tail (a full stop after a number) isn't part of the number.
      pendingNeutrals += 1;
    }
  }
  flush(items.length - 1);
  return groups;
}

/**
 * One line of runs → text in logical order.
 *
 * Characters within a run are already logical; only the runs are out of order.
 * So this reorders runs and never reverses a string: sorting by left edge —
 * descending for RTL, where the rightmost run is read first — restores the
 * reading order, and `ltrGroups` then puts back the stretches that read the
 * other way.
 */
function renderLine(items: Item[]): string {
  const rtl = isRtlLine(items);
  const ordered = [...items].sort((a, b) =>
    rtl ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]
  );

  if (rtl) {
    const dirs = ordered.map((it) => runDir(it.str));
    for (const [from, to] of ltrGroups(ordered, dirs)) {
      const slice = ordered.slice(from, to + 1).reverse();
      for (let i = 0; i < slice.length; i++) ordered[from + i] = slice[i];
    }
  }

  let out = "";
  let prev: Item | null = null;
  for (const it of ordered) {
    if (prev && spaced(prev, it) && !/\s$/.test(out) && !/^\s/.test(it.str)) {
      out += " ";
    }
    out += it.str;
    prev = it;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Positioned glyph runs from one page → its lines, top to bottom. */
export function reconstructLines(rawItems: PdfTextItemLike[]): string[] {
  const items: Item[] = [];
  for (const it of rawItems) {
    // Drop pdf.js's own whitespace items. It synthesizes them by guessing at
    // the run *stream*, which is the very thing that can't be trusted here —
    // in this PDF they land mid-word (السي ارات) because the stream is in
    // visual order. Spacing is decided below, from position alone.
    if (it.str.trim().length === 0) continue;
    const str = clean(it.str);
    // A run `clean` empties is kept, empty, when it occupies real width on the
    // page. It contributes no text, but removing it opens a gap wide enough to
    // read as a space — the budget's «الـمجـمـــــوع» sets its tatweel as its
    // own 2.7-wide run, and dropping that imports the total row as «المج موع»,
    // which no longer reads as a total. A width-0 run (the unmapped U+0002
    // glyphs) takes up nothing, so it goes: keeping it would fake the gap
    // instead of preserving it.
    if (str.length === 0 && !(it.width && it.width > 0)) continue;
    items.push({ ...it, str });
  }

  const lines: { y: number; items: Item[] }[] = [];
  for (const it of items) {
    const y = it.transform[5];
    let line = lines.find((l) => Math.abs(l.y - y) <= Y_TOLERANCE);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }

  // Descending: PDF y grows upwards, so the top of the page is the largest y.
  lines.sort((a, b) => b.y - a.y);
  return lines.map((l) => renderLine(l.items)).filter((l) => l.length > 0);
}

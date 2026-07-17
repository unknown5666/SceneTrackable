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
 * NFKC folds the Arabic presentation forms (U+FB50–U+FDFF, U+FE70–U+FEFC) that
 * some extractors emit back to base letters. This PDF happens to use base
 * letters already, but `HEADING_AR_RE` and `ARABIC_LETTER` are written against
 * base letters, so normalizing here is what keeps the other kind of Arabic PDF
 * from parsing to zero scenes.
 */
function clean(str: string): string {
  return str.normalize("NFKC").replace(CONTROL_CHARS, "").replace(ARABIC_HARAKAT, "");
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
 * One line of runs → text in logical order.
 *
 * Characters within a run are already logical; only the runs are out of order.
 * So this reorders runs and never reverses a string: sorting by left edge —
 * descending for RTL, where the rightmost run is read first — restores the
 * reading order without touching the runs themselves.
 */
function renderLine(items: Item[]): string {
  const rtl = isRtlLine(items);
  const ordered = [...items].sort((a, b) =>
    rtl ? b.transform[4] - a.transform[4] : a.transform[4] - b.transform[4]
  );

  let out = "";
  let prev: Item | null = null;
  for (const it of ordered) {
    if (prev) {
      // Measure the empty space between the runs as laid out, which means
      // subtracting from whichever edge faces the other run.
      const gap = rtl
        ? prev.transform[4] - (it.transform[4] + widthOf(it))
        : it.transform[4] - (prev.transform[4] + widthOf(prev));
      const size = Math.abs(it.transform[3]) || it.height || 10;
      if (gap > size * SPACE_RATIO && !/\s$/.test(out) && !/^\s/.test(it.str)) {
        out += " ";
      }
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
    const str = clean(it.str);
    // Drop pdf.js's own whitespace items. It synthesizes them by guessing at
    // the run *stream*, which is the very thing that can't be trusted here —
    // in this PDF they land mid-word (السي ارات) because the stream is in
    // visual order. Spacing is decided below, from position alone.
    if (str.trim().length > 0) items.push({ ...it, str });
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

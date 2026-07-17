/**
 * Fixtures for the line reconstruction, so the Arabic PDF import can't quietly
 * regress to the scrambled text that made it import zero scenes.
 *
 * Every Arabic case below is real geometry, copied out of
 * `مسلسل دقيقتين السعودي.pdf` — the run strings, x offsets, widths and the
 * width-0 diacritic runs are what pdf.js actually reports for those lines. That
 * matters: the bugs here were all in the *numbers* (a zero width faking a word
 * gap, pdf.js's own space items landing mid-word), and invented coordinates
 * would have tested none of them.
 *
 *   npx tsx scripts/pdf-lines-test.ts
 */
import { reconstructLines, type PdfTextItemLike } from "../src/lib/pdf-lines";

/** `[str, x, width]` at a font size, laid out on one baseline. */
type Run = [string, number, number];

function line(runs: Run[], size = 12, y = 100): PdfTextItemLike[] {
  return runs.map(([str, x, width]) => ({
    str,
    width,
    height: size,
    dir: /[؀-ۿ]/.test(str) ? "rtl" : "ltr",
    transform: [size, 0, 0, size, x, y],
  }));
}

let failures = 0;
function check(label: string, got: string, want: string) {
  const ok = got === want;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        want ${JSON.stringify(want)}`);
    console.log(`        got  ${JSON.stringify(got)}`);
    failures++;
  }
}

const one = (items: PdfTextItemLike[]) => reconstructLines(items).join("\n");

console.log("RTL RECONSTRUCTION (real geometry from the Saudi drama PDF)");

// p17 — the runs arrive in visual order and must be re-ordered by x, right to
// left. U+0002 is an unmapped glyph and must not survive.
check(
  "master heading, right-to-left by x",
  one(
    line([
      ["★ ماسرت", 281.11, 39.52],
      ["|", 271.1, 3.35],
      ["م", 258.55, 5.87],
      ["١٨", 246.45, 12.0],
      ["—", 231.16, 12.0],
      ["خارج", 205.6, 22.38],
      ["", 200.85, 0],
      ["ي", 197.15, 8.4],
      ["|", 187.06, 3.35],
      ["موقف الس", 139.4, 41.04],
      ["ي", 135.28, 4.06],
      ["", 134.3, 0],
      ["ارات", 114.54, 20.74],
      ["|", 104.55, 3.35],
      ["المساء", 72.1, 25.75],
    ])
  ),
  "★ ماسرت | م١٨ — خارجي | موقف السيارات | المساء"
);

// The word-splitting bug: pdf.js reports width 0 for "ًك" and "ُي", which fakes
// a gap wide enough to read as a space (مكتب → م ًكتب). The harakat go too, so
// مكتب groups with the other مكتب scenes rather than forking the location.
check(
  "width-0 diacritic runs don't split words, and harakat are dropped",
  one(
    line([
      ["م", 209.45, 5.57],
      ["ًك", 203.0, 0],
      ["تب ناصر", 163.68, 39.24],
      ["—", 148.32, 12.0],
      ["أول", 130.3, 14.69],
      ["ُي", 121.95, 0],
      ["وم", 112.86, 10.2],
      ["|", 102.9, 3.35],
      ["صباح", 72.05, 24.16],
    ])
  ),
  "مكتب ناصر — أول يوم | صباح"
);

// A real gap (≈6.5 at 12pt) is a space; an intra-word gap (≈0) is not.
check(
  "real gaps become spaces, tight runs don't",
  one(
    line([
      ["داخل", 240.1, 18.92],
      ["", 235.45, 0],
      ["ي", 231.75, 8.4],
      ["|", 221.61, 3.35],
      ["ب", 197.85, 3.94],
      ["ي", 193.68, 4.06],
      ["", 192.7, 0],
      ["ت سالم", 160.29, 33.44],
    ])
  ),
  "داخلي | بيت سالم"
);

// pdf.js synthesizes whitespace items from the run *stream*, which is in visual
// order here — so its guesses land mid-word and must be ignored in favour of
// the geometry.
check(
  "pdf.js's own whitespace items are ignored",
  one(
    line([
      ["موقف الس", 139.4, 41.04],
      ["ي", 135.28, 4.06],
      [" ", 134.3, 0],
      ["ارات", 114.54, 20.74],
    ])
  ),
  "موقف السيارات"
);

// Presentation forms (U+FE70–U+FEFC) fold to base letters, which is what
// HEADING_AR_RE and ARABIC_LETTER match against.
check(
  "Arabic presentation forms fold to base letters",
  one(line([["ﻟﻠﺎﻛ", 100, 24]])),
  "للاك"
);

console.log("\nLTR IS UNAFFECTED");

check(
  "English slugline reads left to right",
  one(line([["INT. DINER", 72, 60], ["-", 136, 4], ["NIGHT", 144, 32]], 12)),
  "INT. DINER - NIGHT"
);

check(
  "a tight English run isn't split",
  one(line([["MAR", 72, 20], ["IA", 92, 12]], 12)),
  "MARIA"
);

console.log("\nLINE GROUPING");

check(
  "baselines group into lines, top of page first",
  reconstructLines([
    ...line([["SECOND", 72, 40]], 12, 500),
    ...line([["FIRST", 72, 30]], 12, 700),
  ]).join("|"),
  "FIRST|SECOND"
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// ============================================================
// BUDGET FILE → TOP-SHEET LINES
//
// A production's budget arrives as whatever the accountant sent: a PDF top
// sheet, a CSV out of a spreadsheet, a pasted table. This module turns any of
// those into `BudgetLine`s, in Arabic or English, and — the part that matters
// most — is explicit about what it could not work out, so the import UI can ask
// instead of guessing. A budget silently filed under the wrong section is worse
// than one the user was asked about.
//
// The parsing is deliberately kept out of the component: it is pure text in and
// rows out, so it can be exercised from plain Node (see scripts/budget-test.ts)
// against the real PDFs rather than only through the modal.
// ============================================================

import type { BudgetLine, DepartmentId } from "@/types";
import { detectLanguage, type ScriptLanguage } from "@/lib/lang";
import { id } from "@/lib/utils";

// ------------------------------------------------------------
// Sections — the top-sheet categories a row can land in
// ------------------------------------------------------------

export interface BudgetSection {
  id: string;
  en: string;
  ar: string;
  /** Which department owns the spend, so POs and reports can group by it. */
  department: DepartmentId;
}

/**
 * The sections a budget row can be filed under.
 *
 * Kept short on purpose. This is the axis the top sheet groups by and the user
 * may have to pick from row by row, so a list they can scan beats an exhaustive
 * chart of accounts — and the account *code* from their own file is preserved
 * on every line, so nothing about their numbering is lost by grouping coarsely.
 */
export const BUDGET_SECTIONS: BudgetSection[] = [
  { id: "above_the_line", en: "Above the Line", ar: "فوق الخط", department: "production" },
  { id: "production", en: "Production Crew", ar: "الطاقم الفني", department: "production" },
  { id: "camera", en: "Camera", ar: "التصوير", department: "camera" },
  { id: "lighting_grip", en: "Lighting & Grip", ar: "الإضاءة والمعدات", department: "camera" },
  { id: "sound", en: "Sound", ar: "الصوت", department: "sound" },
  { id: "art", en: "Art, Props & Wardrobe", ar: "الديكور والإكسسوارات", department: "art" },
  { id: "makeup", en: "Makeup & Hair", ar: "الماكياج والشعر", department: "wardrobe" },
  { id: "cast", en: "Cast & Extras", ar: "الممثلون والكومبارس", department: "cast" },
  { id: "locations", en: "Locations", ar: "مواقع التصوير", department: "production" },
  { id: "transport", en: "Transport", ar: "النقل والمواصلات", department: "transport" },
  { id: "catering", en: "Catering & Accommodation", ar: "الإعاشة والإقامة", department: "production" },
  { id: "post", en: "Post Production", ar: "ما بعد الإنتاج", department: "vfx" },
  { id: "other", en: "Other & Contingency", ar: "مصاريف أخرى وطوارئ", department: "accounting" },
];

const SECTION_BY_ID = new Map(BUDGET_SECTIONS.map((s) => [s.id, s]));

export function sectionLabel(sectionId: string, lang: ScriptLanguage): string {
  const s = SECTION_BY_ID.get(sectionId);
  if (!s) return sectionId;
  return lang === "ar" ? s.ar : s.en;
}

export function sectionDepartment(sectionId: string): DepartmentId {
  return SECTION_BY_ID.get(sectionId)?.department ?? "accounting";
}

/**
 * Arabic folded to a form two spellings of the same word share.
 *
 * Three things vary in the text this has to match, and none of them carry
 * meaning:
 *
 *   - Hamza and the final ya/ta: إنتاج / انتاج, داخلي / داخلى, كاميرة / كاميره
 *     are one word written two ways, and this budget uses both.
 *   - The lam-alef ligature arrives *reversed*. It is one glyph holding two
 *     letters, and this PDF stores them in visual order inside the run, so
 *     الإنتاج comes out اإلنتاج and الاكسسوارات comes out االكسسوارات. Unlike the
 *     Allah ligature there is no safe way to undo it in the text — the correct
 *     sequence ال opens the definite article on a large share of all Arabic
 *     words, so a rule that swapped it would break far more than it fixed.
 *
 * So instead of repairing the order, this makes matching blind to it: every
 * run of alefs and lams is rewritten with its alefs first. الإنتاج and اإلنتاج
 * both fold to the same string, and a correctly-spelled word folds to a form
 * its own keyword folds to as well, so nothing is matched that shouldn't be.
 */
export function foldArabic(s: string): string {
  return s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[الل]{2,}/g, (run) => {
      const alefs = [...run].filter((c) => c === "ا").length;
      return "ا".repeat(alefs) + "ل".repeat(run.length - alefs);
    })
    .toLowerCase();
}

/**
 * What a description means, most specific rule first.
 *
 * Order is the whole design. «مخرج العمل» is the director and sits above the
 * line; «مخرج منفذ» and «مساعد مخرج» are crew and do not — and all three
 * contain مخرج, so the crew roles have to be claimed before the bare word is
 * reached. Post has to precede sound for the same reason: «تصحيح الصوت» is a
 * grading-suite line, not a boom operator, and it contains صوت.
 *
 * Arabic is matched as folded substrings rather than by regex. JS `\b` is
 * ASCII-only so a word boundary around Arabic never fires, and `foldArabic`
 * has to be applied to both sides for the ligature to be seen through. That
 * makes each keyword deliberately narrow — a stem short enough to catch
 * inflections but long enough not to appear inside an unrelated word.
 */
const SECTION_RULES: { ar: string[]; en?: RegExp; section: string }[] = [
  // Above the line — authorship and the director, before any crew role.
  { ar: ["مؤلف", "كاتب العمل", "سيناريو", "حوار"], en: /writer|screenplay|author/i, section: "above_the_line" },
  { ar: ["مخرج منفذ", "مساعد مخرج", "سكريبت"], en: /assistant director|\bAD\b|script supervisor|line producer/i, section: "production" },
  { ar: ["مخرج", "إخراج"], en: /\bdirector\b(?!\s+of\s+photography)/i, section: "above_the_line" },
  { ar: ["منتج منفذ", "المنتج", "إنتاج تنفيذي"], en: /executive producer|\bproducer\b/i, section: "above_the_line" },

  // Post before sound and camera: this budget writes the whole finishing chain
  // on one row, and every word in it also names a shooting department.
  {
    ar: ["مونتاج", "مكساج", "تصحيح الالوان", "تصحيح الصوت", "ترجمة", "موسيقى", "جرافيكس", "تريلير", "مؤثرات بصرية"],
    en: /\bDCP\b|\bDCB\b|post|edit|colou?r grade|grading|\bmix\b|subtitl|music|graphic|trailer|\bVFX\b|\bCGI\b/i,
    section: "post",
  },

  // Department heads and their kit.
  { ar: ["مدير التصوير", "مصور", "كامير", "عدسات"], en: /\bDIT\b|director of photography|\bDOP\b|\bDP\b|camera|lens|\bmonitor\b/i, section: "camera" },
  { ar: ["إضاءة", "كرين", "شاريو", "رافعة", "جنريتر", "مولد كهرب"], en: /lighting|gaffer|\bgrip\b|crane|dolly|generator|\bHMI\b/i, section: "lighting_grip" },
  { ar: ["صوت", "ميكرفون", "مايك"], en: /sound|\bmic\b|boom|mixer|recordist/i, section: "sound" },
  { ar: ["ماكير", "ماكياج", "مكياج", "شعر", "باروك"], en: /makeup|make-up|hair/i, section: "makeup" },
  { ar: ["ديكور", "اكسسوار", "ملابس", "أزياء", "خياط"], en: /props|wardrobe|costume|set dress|art director|production design/i, section: "art" },

  // Production office and the things it books.
  { ar: ["إدارة إنتاج", "مدير إنتاج", "منفذو الإنتاج", "منفذ الإنتاج"], en: /production manager|production coordinator|\bPA\b/i, section: "production" },
  { ar: ["مواقع التصوير", "موقع", "مواقع", "بيوت", "فلل", "استوديو", "تصاريح"], en: /location|studio|stage|permit/i, section: "locations" },
  { ar: ["سيارات", "سيارة", "نقل", "مواصلات", "وقود", "بنزين", "شحن", "شاحنة"], en: /transport|vehicle|fuel|petrol|driver/i, section: "transport" },
  { ar: ["وجبات", "طعام", "إعاشة", "فنادق", "فندق", "سكن", "إقامة", "تذاكر", "طيران"], en: /catering|meals|craft service|hotel|accommodation|per diem|flight/i, section: "catering" },

  // Cast last: أجور (fees) also appears on crew rows, so the crew rules above
  // have to have had their turn before a fee row is read as talent.
  { ar: ["ممثل", "فنانين", "كومبارس", "كومبرس", "أدوار"], en: /cast|actor|extras|background artist|talent|stunt/i, section: "cast" },
  { ar: ["مصاريف", "نثريات", "طوارئ", "احتياطي", "متفرقات", "تأمين"], en: /misc|contingency|overhead|insurance|other/i, section: "other" },
];

/** The section a description implies, or null when nothing claims it. */
export function guessSection(description: string): string | null {
  const folded = foldArabic(description);
  for (const rule of SECTION_RULES) {
    if (rule.ar.some((k) => folded.includes(foldArabic(k)))) return rule.section;
    if (rule.en?.test(description)) return rule.section;
  }
  return null;
}

// ------------------------------------------------------------
// Numbers
// ------------------------------------------------------------

/** Arabic-Indic and Persian digits → ASCII. */
function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/**
 * A number token as written, repaired if it arrived backwards.
 *
 * `lib/pdf-lines` puts the digit runs of an RTL line back in reading order, but
 * it can only do that when the digits arrive as separate runs. A PDF that emits
 * "20,000" as one visually-ordered run reaches here as "000,02", and no amount
 * of run sorting will help. What gives it away is the grouping: real thousands
 * separators leave 1–3 digits in front and exactly 3 behind, so "000,02" is
 * impossible and its reverse is not.
 *
 * Returns null when neither reading is a valid number, so the caller can leave
 * the amount blank and ask rather than invent a figure.
 */
export function parseAmount(raw: string): number | null {
  const t = toAsciiDigits(raw).replace(/[‎‏‪-‮]/g, "").trim();
  if (!/\d/.test(t)) return null;

  const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
  const plain = /^\d+(\.\d+)?$/;

  const candidates = [t, [...t].reverse().join("")];
  for (const c of candidates) {
    if (grouped.test(c) || plain.test(c)) {
      return Number(c.replace(/,/g, ""));
    }
  }
  return null;
}

/** Every number-looking token in a line, in order, with what it parses to. */
interface NumToken {
  text: string;
  value: number;
  index: number;
}

function numberTokens(line: string): NumToken[] {
  const out: NumToken[] = [];
  const re = /[\d٠-٩۰-۹][\d٠-٩۰-۹.,]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const value = parseAmount(m[0]);
    if (value !== null) out.push({ text: m[0], value, index: m.index });
  }
  return out;
}

// ------------------------------------------------------------
// Rows
// ------------------------------------------------------------

/** Why a row can't be imported as-is. */
export type BudgetRowIssue = "no_section" | "no_amount";

export interface ParsedBudgetRow {
  id: string;
  /** The account code from the file's own numbering, when it has one. */
  code: string;
  description: string;
  /** Head count / unit count from a «العدد» column, when the row carries one. */
  qty?: number;
  /** null when the row named no money — the user is asked to supply it. */
  amount: number | null;
  /** null when nothing claimed the description — the user is asked to pick. */
  section: string | null;
  /** True when `section` was guessed rather than read from the file. */
  guessed: boolean;
  /** The source line, shown in the review table so the user can check us. */
  raw: string;
  issues: BudgetRowIssue[];
}

export interface ParsedBudget {
  rows: ParsedBudgetRow[];
  /** The file's own heading line, when it has one. */
  title?: string;
  language: ScriptLanguage;
  /** The «المجموع» / «Total» the file states, for reconciliation. */
  declaredTotal: number | null;
  /** Currency code if the file names one, else undefined. */
  currency?: string;
  /** Lines that looked like neither a row nor a header, kept for the UI. */
  skipped: string[];
}

// Matched against the folded line, so a decorated «الـمجـمـ__وع» and a
// hamza-less «الاجمالي» are both caught. `\b` is left off the Arabic for the
// usual reason: it is ASCII-only and never fires next to an Arabic letter.
const TOTAL_WORDS_AR = ["المجموع", "الاجمالي", "المجمل", "اجمالي"];
const TOTAL_WORDS_EN = /\btotal\b|\bsum\b|grand total/i;
const HEADER_WORDS_AR = ["البند", "الوصف", "الطاقم", "التفاصيل", "العدد", "المبلغ", "بالدرهم", "الملاحظات", "ملاحظات"];
const HEADER_WORDS_EN =
  /\b(?:description|item|qty|quantity|amount|budget|notes?|category|section|account)\b/i;
/** A budget's own title line — the heading above the table, not a row in it. */
const TITLE_WORDS_AR = ["ميزانية", "الميزانيه", "موازنه"];
const TITLE_WORDS_EN = /\bbudget\b|\btop ?sheet\b|estimate/i;

function hasAny(folded: string, keywords: string[]): boolean {
  return keywords.some((k) => folded.includes(foldArabic(k)));
}
const CURRENCY_WORDS: [RegExp, string][] = [
  [/درهم|\bAED\b|\bDHS?\b/i, "AED"],
  [/ريال سعودي|\bSAR\b/i, "SAR"],
  [/ريال|\bQAR\b/i, "QAR"],
  [/دينار|\bKWD\b|\bBHD\b/i, "KWD"],
  [/جنيه|\bEGP\b/i, "EGP"],
  [/\bUSD\b|\$|دولار/i, "USD"],
  [/\bEUR\b|€|يورو/i, "EUR"],
  [/\bGBP\b|£/i, "GBP"],
];

function detectCurrency(text: string): string | undefined {
  for (const [re, code] of CURRENCY_WORDS) if (re.test(text)) return code;
  return undefined;
}

/** Split on a delimiter, ignoring delimiters inside double quotes. */
function splitQuoted(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // "" inside a quoted cell is a literal quote, not the end of one.
      if (inQuotes && line[i + 1] === '"') {
        cell += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cell += ch;
    } else if (ch === delim && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * A delimited line split into its cells, or null if the line isn't delimited.
 *
 * The comma is the awkward one, because a budget's commas are thousands
 * separators far more often than they are field separators — and splitting
 * "50,000" into two cells destroys the only number on the row. So a comma
 * counts as a delimiter only when the file quotes its numbers (in which case
 * the quote-aware split has already protected them) or when no grouped number
 * appears on the line at all. An unquoted CSV carrying bare "50,000" is
 * genuinely ambiguous, and it reads better as free text, where the amount is
 * identified by what it looks like rather than by which cell it fell into.
 */
function splitDelimited(line: string): string[] | null {
  for (const d of ["\t", ";", "|"]) {
    if (line.includes(d)) return splitQuoted(line, d);
  }
  if (line.includes(",") && (line.includes('"') || !/\d,\d{3}(\D|$)/.test(line))) {
    return splitQuoted(line, ",");
  }
  return null;
}

/** Strip the wrapping quotes a CSV writer adds. */
function unquote(cell: string): string {
  const t = cell.trim();
  return /^".*"$/.test(t) ? t.slice(1, -1).replace(/""/g, '"') : t;
}

/**
 * One free-text line → a row.
 *
 * The field order is not fixed and cannot be made so. This budget's rows read
 * «code description qty amount», but the reconstruction of an all-Latin row in
 * an RTL table comes back reversed («15,000 DIT 27»), and rows exist with no
 * code, no count, or the amount in the middle of the text. So each field is
 * identified by what it *is* rather than by where it sits:
 *
 *   - the code is a small integer at either end of the line, next to text;
 *   - the amount is the largest number left, since a budget row's money is
 *     always larger than its head count;
 *   - the count is a small integer that isn't the code.
 *
 * A row with only one number is the case that forces this. «مخرج منفذ 1 20,000»
 * has both, but «معدات صوت 50,000 كاملة» has only money and «28» only a code,
 * and taking the last number on faith mistakes one for the other.
 */
function parseFreeLine(line: string): ParsedBudgetRow | null {
  const nums = numberTokens(line);
  const text = line.replace(/[\d٠-٩۰-۹][\d٠-٩۰-۹.,]*/g, " ").replace(/\s+/g, " ").trim();
  // A description of one stray character is punctuation left over from a rule
  // or a page number, not a budget row.
  const words = text.replace(/[^\p{L}]+/gu, "").length;
  if (words < 2) return null;

  const pool = nums.slice();
  const trimmed = line.trim();
  let code = "";

  const codeLike = (n: NumToken) =>
    Number.isInteger(n.value) && n.value > 0 && n.value < 10000 && !n.text.includes(",");

  // A number opening the line, with text after it, is the «م» column — even
  // when it is the row's only number. «20 أجار كاميرة تصوير» has an account
  // code and no money, and reading its 20 as money would book a camera rental
  // at twenty dirhams instead of asking what it costs.
  const first = pool[0];
  if (first && first.index <= 1 && codeLike(first) && /^\s*[\d٠-٩۰-۹.,]+\s+\D/.test(trimmed)) {
    code = String(first.value);
    pool.shift();
  } else {
    // Otherwise the code may be at the far end: an all-Latin row inside an RTL
    // table comes back reversed, so «27 DIT 15,000» reads «15,000 DIT 27». Only
    // when something else is left to be the money.
    const last = pool[pool.length - 1];
    if (last && pool.length > 1 && codeLike(last) && last.index + last.text.length >= trimmed.length - 1) {
      code = String(last.value);
      pool.pop();
    }
  }

  let amount: number | null = null;
  let qty: number | undefined;
  if (pool.length > 0) {
    const money = pool.reduce((a, b) => (b.value > a.value ? b : a));
    // Money is grouped or it is large. A bare small number on a text row is a
    // head count — «فني إضاءة عدد (4)» budgets nothing by itself — and a stray
    // decimal is prose, as in «تحويل الصوت الى 5.5». Both must be asked about
    // rather than booked.
    if (money.text.includes(",") || money.value >= 100) {
      amount = money.value;
      pool.splice(pool.indexOf(money), 1);
    }
    const count = pool.find((n) => Number.isInteger(n.value) && n.value > 0 && n.value < 1000);
    if (count) qty = count.value;
  }

  const section = guessSection(text);
  const issues: BudgetRowIssue[] = [];
  if (!section) issues.push("no_section");
  if (amount === null) issues.push("no_amount");

  return {
    id: id("bl"),
    code,
    description: text,
    qty,
    amount,
    section,
    guessed: section !== null,
    raw: line.trim(),
    issues,
  };
}

/**
 * A delimited row → a budget row, using the header to place the cells.
 *
 * Column names beat position here, because a spreadsheet export puts them
 * wherever the author liked. Where the header names a section outright, that is
 * taken over any guess — the user's own filing is better than ours.
 */
function parseDelimitedLine(cells: string[], header: string[] | null): ParsedBudgetRow | null {
  // Anchored at the start of the cell, and `\b`-terminated for the Latin
  // names. A header cell is a column *name*, so a loose substring test reads
  // "Account" as a quantity column — "count" is inside it — and every row's
  // head count comes back as its account code.
  const find = (re: RegExp) => (header ? header.findIndex((h) => re.test(h.trim())) : -1);
  const iDesc = find(/^(?:البند|الوصف|التفاصيل|الطاقم|(?:description|item|detail|account name)\b)/i);
  const iAmount = find(/^(?:المبلغ|بالدرهم|التكلفة|الميزانية|(?:amount|budget|cost|total|value)\b)/i);
  const iQty = find(/^(?:العدد|الكمية|(?:qty|quantity|count|units|no\. of)\b)/i);
  const iCode = find(/^(?:م|الرمز|الكود|(?:code|account|acct|no\.?|#)\b)$|^(?:code|account)\b/i);
  const iSection = find(/^(?:القسم|الفئة|(?:category|section|group)\b)/i);

  const at = (i: number) => (i >= 0 && i < cells.length ? unquote(cells[i]) : "");
  const description = at(iDesc) || cells.map(unquote).find((c) => /\p{L}{2,}/u.test(c)) || "";
  if (!/\p{L}{2,}/u.test(description)) return null;

  const amount = iAmount >= 0 ? parseAmount(at(iAmount)) : null;
  const qtyRaw = iQty >= 0 ? parseAmount(at(iQty)) : null;

  // No usable header — the cells are positional, so fall back to reading the
  // row as free text, which identifies each field by what it is.
  if (iDesc < 0 && iAmount < 0) return parseFreeLine(cells.join(" "));

  const named = at(iSection);
  const section =
    (named && BUDGET_SECTIONS.find((s) => s.en === named || s.ar === named || s.id === named)?.id) ||
    guessSection(`${description} ${named}`);

  const issues: BudgetRowIssue[] = [];
  if (!section) issues.push("no_section");
  if (amount === null) issues.push("no_amount");

  return {
    id: id("bl"),
    code: at(iCode).replace(/\s+/g, ""),
    description: description.trim(),
    qty: qtyRaw ?? undefined,
    amount,
    section: section || null,
    guessed: !!section && !named,
    raw: cells.join(" | "),
    issues,
  };
}

/**
 * A budget file's text → rows, in either language.
 *
 * Wrapped descriptions are the reason this is a stateful pass rather than a
 * map. A long account name spills over two or three lines in a PDF, and those
 * continuations carry no number and no code — «والترجمة والموسيقى وتحويل الصوت»
 * is the second line of row 18, not a row of its own. Folding them back into
 * the row above is what keeps the description whole and stops three phantom
 * rows with no money from being raised as questions for the user.
 */
export function parseBudgetText(raw: string): ParsedBudget {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const rows: ParsedBudgetRow[] = [];
  const skipped: string[] = [];
  let declaredTotal: number | null = null;
  let header: string[] | null = null;

  let title: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const folded = foldArabic(line);
    const nums = numberTokens(line);
    const hasMoney = nums.some((n) => n.text.includes(",") || n.value >= 100);

    if (hasAny(folded, TOTAL_WORDS_AR) || TOTAL_WORDS_EN.test(line)) {
      if (nums.length > 0) {
        declaredTotal = nums.reduce((a, b) => (b.value > a.value ? b : a)).value;
        skipped.push(line);
        continue;
      }
    }

    // The title line, which names the film and often the currency. Only before
    // any row has been read — «ميزانية» inside a row's description further down
    // is a description, not a second title.
    if (
      rows.length === 0 &&
      !hasMoney &&
      (hasAny(folded, TITLE_WORDS_AR) || TITLE_WORDS_EN.test(line))
    ) {
      title = title ?? line;
      skipped.push(line);
      continue;
    }

    const cells = splitDelimited(line);
    if ((hasAny(folded, HEADER_WORDS_AR) || HEADER_WORDS_EN.test(line)) && !hasMoney) {
      if (cells) header = cells.map(unquote);
      skipped.push(line);
      continue;
    }

    const row = cells ? parseDelimitedLine(cells, header) : parseFreeLine(line);
    if (!row) {
      skipped.push(line);
      continue;
    }

    // A continuation of the row above: prose, no code, no money.
    const prev = rows[rows.length - 1];
    if (prev && !row.code && row.amount === null && row.qty === undefined && !cells) {
      prev.description = `${prev.description} ${row.description}`.replace(/\s+/g, " ").trim();
      prev.raw = `${prev.raw} ${row.raw}`;
      if (!prev.section) {
        const section = guessSection(prev.description);
        if (section) {
          prev.section = section;
          prev.guessed = true;
          prev.issues = prev.issues.filter((i) => i !== "no_section");
        }
      }
      continue;
    }

    rows.push(row);
  }

  const text = lines.join(" ");
  return {
    rows,
    title,
    language: detectLanguage(raw),
    declaredTotal,
    currency: detectCurrency(text),
    skipped,
  };
}

// ------------------------------------------------------------
// Rows → store records
// ------------------------------------------------------------

/**
 * Reviewed rows → `BudgetLine`s.
 *
 * Only rows the user has resolved come through: a row still missing a section
 * has no honest place on the top sheet, and one still missing an amount would
 * report a budget smaller than the file the user handed us. Both are filtered
 * rather than defaulted, and the modal blocks the import until neither exists.
 */
export function toBudgetLines(
  rows: ParsedBudgetRow[],
  lang: ScriptLanguage
): BudgetLine[] {
  return rows
    .filter((r) => r.section && r.amount !== null)
    .map((r, i) => ({
      id: r.id,
      code: r.code || String((i + 1) * 10).padStart(4, "0"),
      category: sectionLabel(r.section as string, lang),
      subcategory: r.qty && r.qty > 1 ? `×${r.qty}` : undefined,
      department: sectionDepartment(r.section as string),
      description: r.description,
      budgeted: r.amount as number,
      committed: 0,
      spent: 0,
    }));
}

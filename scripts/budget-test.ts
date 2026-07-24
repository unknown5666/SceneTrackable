/**
 * Runs a real budget file through the same parser the import modal uses and
 * prints the rows it would show for review.
 *
 * `src/lib/pdf.ts` can't be imported outside Vite — it pulls the pdf.js worker
 * in through a `?url` import — so this loads pdf.js directly and hands the text
 * items to `reconstructLines`, exactly as scripts/arabic-pdf-repro.ts does.
 *
 *   npx tsx scripts/budget-test.ts "C:\\path\\to\\budget.pdf"
 *   npx tsx scripts/budget-test.ts budget.csv
 */
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { reconstructLines, type PdfTextItemLike } from "../src/lib/pdf-lines";
import { parseBudgetText, sectionLabel } from "../src/lib/budgetImport";

async function textOf(path: string): Promise<string> {
  if (!/\.pdf$/i.test(path)) return readFileSync(path, "utf8");
  const data = new Uint8Array(readFileSync(path));
  const pdf = await getDocument({ data }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += reconstructLines(content.items as PdfTextItemLike[]).join("\n") + "\n\n";
  }
  return text;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/budget-test.ts <file.pdf|file.csv>");
    process.exit(2);
  }

  const parsed = parseBudgetText(await textOf(path));
  const total = parsed.rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  console.log(
    `${parsed.rows.length} rows · language=${parsed.language} · currency=${parsed.currency ?? "?"}`
  );
  console.log(
    `parsed total ${total.toLocaleString()} · file says ${parsed.declaredTotal?.toLocaleString() ?? "—"}` +
      (parsed.declaredTotal !== null
        ? total === parsed.declaredTotal
          ? "  ✓ reconciles"
          : `  ✗ off by ${Math.abs(parsed.declaredTotal - total).toLocaleString()}`
        : "")
  );
  console.log();

  for (const r of parsed.rows) {
    const flag = r.issues.length ? ` ← ASK: ${r.issues.join(", ")}` : "";
    console.log(
      `  ${(r.code || "—").padStart(3)} | ${(r.amount?.toLocaleString() ?? "—").padStart(9)}` +
        ` | ${(r.qty ? `×${r.qty}` : "").padStart(3)} | ${(r.section ? sectionLabel(r.section, parsed.language) : "???").padEnd(18)} | ${r.description}${flag}`
    );
  }

  if (parsed.skipped.length) {
    console.log(`\nskipped ${parsed.skipped.length} line(s):`);
    for (const s of parsed.skipped) console.log(`  · ${s}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

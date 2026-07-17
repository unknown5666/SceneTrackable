/**
 * Runs a real PDF through the app's own line reconstruction and parser, and
 * prints what the scene list would contain.
 *
 * `src/lib/pdf.ts` can't be imported outside Vite — it pulls the pdf.js worker
 * in through a `?url` import — so this loads pdf.js directly and hands the text
 * items to `reconstructLines`, which is the same function the app calls. The
 * only thing not shared is the six lines of page loop.
 *
 *   npx tsx scripts/arabic-pdf-repro.ts "C:\\path\\to\\script.pdf" [--text]
 */
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { reconstructLines, type PdfTextItemLike } from "../src/lib/pdf-lines";
import { parseScreenplay } from "../src/lib/script";
import { sceneLanguage } from "../src/lib/lang";

async function extract(path: string): Promise<{ text: string; pageCount: number }> {
  const data = new Uint8Array(readFileSync(path));
  const pdf = await getDocument({ data }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += reconstructLines(content.items as PdfTextItemLike[]).join("\n") + "\n\n";
  }
  return { text, pageCount: pdf.numPages };
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error("usage: npx tsx scripts/arabic-pdf-repro.ts <file.pdf> [--text]");
    process.exit(2);
  }

  const { text, pageCount } = await extract(path);
  if (args.includes("--text")) {
    console.log(text);
    return;
  }

  const scenes = parseScreenplay(text);
  console.log(`${pageCount} pages, ${text.length} chars, language=${sceneLanguage(scenes)}`);
  console.log(`${scenes.length} scenes\n`);
  for (const s of scenes) {
    console.log(`  ${s.number}. ${s.intExt} | ${s.location} | ${s.timeOfDay} | ${s.pages}pp`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

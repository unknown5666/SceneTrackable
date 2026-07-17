// ============================================================
// PDF → TEXT
//
// Split out from `lib/script.ts` so the screenplay parser stays importable
// outside the bundler. This module pulls in the pdf.js worker through Vite's
// `?url` suffix, which only resolves under Vite — keeping it here means the
// parser, which is pure text in and scenes out, can be exercised from plain
// Node (see scripts/arabic-smoke.ts).
// ============================================================

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { reconstructLines, type PdfTextItemLike } from "@/lib/pdf-lines";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Line rebuilding is pure geometry and lives in `lib/pdf-lines` so it can
    // be exercised without the bundler.
    const lines = reconstructLines(content.items as PdfTextItemLike[]);
    text += lines.join("\n") + "\n\n";
  }
  return { text, pageCount: pdf.numPages };
}

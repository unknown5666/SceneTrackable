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

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Reconstruct lines from positioned text items.
    let lastY: number | null = null;
    let line = "";
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        text += line.trimEnd() + "\n";
        line = "";
      }
      line += item.str;
      lastY = y;
    }
    if (line.trim()) text += line.trimEnd() + "\n";
    text += "\n";
  }
  return { text, pageCount: pdf.numPages };
}

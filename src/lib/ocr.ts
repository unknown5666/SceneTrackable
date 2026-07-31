// ============================================================
// INVOICE OCR — client-side text extraction for the invoice-parse pipeline
// ============================================================
// The app's only AI model has no vision input, so it can never read an
// uploaded photo/PDF directly. This module is what turns a file into plain
// text before it reaches the model: `tesseract.js` (dynamically imported —
// its wasm/worker bundle is only worth loading when someone actually clicks
// "Process Invoice with AI") for photos, and the existing `extractPdfText`
// for digital PDFs.

import { extractPdfText } from "@/lib/pdf";

/** Extracts raw text from an uploaded invoice/receipt file — image or PDF. */
export async function recognizeInvoiceText(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    const { text } = await extractPdfText(file);
    return text;
  }
  if (file.type.startsWith("image/")) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(file);
      return text;
    } finally {
      await worker.terminate();
    }
  }
  throw new Error(`Unsupported file type for OCR: ${file.type || "unknown"}`);
}

/** Reads a File as a small base64 data-URI — same "no real storage backend" convention as imageUrl fields. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

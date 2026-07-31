import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportTable } from "@/lib/reports";

// ============================================================
// PDF EXPORT — real, downloadable .pdf files (client-side, via jsPDF)
// ============================================================
// `src/lib/reports.ts` still owns CSV + browser print-to-PDF (Save As…).
// This module is the third output path: an actual PDF Blob/File, which is
// what the share layer (src/lib/share.ts, ShareMenu) needs to hand users a
// real attachment — WhatsApp's click-to-chat API can't attach a file itself,
// so the flow is: download this PDF, then open WhatsApp with a text summary.

const BRAND_FOOTER = "SceneTrackable · Built by OverExposure Productions";

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 44);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(subtitle, 40, 62);
    doc.setTextColor(0);
  }
  doc.setDrawColor(20);
  doc.setLineWidth(1);
  doc.line(40, 72, doc.internal.pageSize.getWidth() - 40, 72);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.text(BRAND_FOOTER, 40, h - 20);
    doc.text(`Page ${i} of ${pageCount}`, w - 100, h - 20);
    doc.setTextColor(0);
  }
}

/** A tabular report (same `ReportTable` the CSV/print exports use) as a real PDF. */
export function buildTablePdf(title: string, subtitle: string, table: ReportTable): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  addHeader(doc, title, subtitle);
  autoTable(doc, {
    startY: 84,
    head: [table.columns],
    body: table.rows,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [40, 40, 45], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 247, 249] },
    margin: { left: 40, right: 40 },
  });
  addFooter(doc);
  return doc;
}

/** A single-record detail sheet — scene, location, cast member, wardrobe piece… */
export function buildEntityPdf(
  title: string,
  subtitle: string | undefined,
  sections: { heading: string; rows: [string, string][] }[]
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  addHeader(doc, title, subtitle);
  let y = 96;
  for (const section of sections) {
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(section.heading, 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      body: section.rows,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 } },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error lastAutoTable is attached by the plugin at runtime
    y = doc.lastAutoTable.finalY + 20;
  }
  addFooter(doc);
  return doc;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function pdfFilename(projectTitle: string, kind: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug(projectTitle || "project")}-${slug(kind)}-${stamp}.pdf`;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function pdfBlob(doc: jsPDF): Blob {
  return doc.output("blob");
}

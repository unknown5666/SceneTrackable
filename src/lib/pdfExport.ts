import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BRAND_FOOTER,
  COLOR_KEY,
  TONE_CSS,
  accentHex,
  exportFilename,
  statusTone,
  type ReportTable,
  type StatusTone,
} from "@/lib/reports";

// ============================================================
// PDF EXPORT — real, downloadable .pdf files (client-side, via jsPDF)
// ============================================================
// `src/lib/reports.ts` still owns CSV + browser print-to-PDF (Save As…).
// This module is the third output path: an actual PDF Blob/File, which is
// what the share layer (src/lib/share.ts, ShareMenu) needs to hand users a
// real attachment — WhatsApp's click-to-chat API can't attach a file itself,
// so the flow is: download this PDF, then open WhatsApp with a text summary.
//
// Every table is drawn with the "grid" theme so EVERY row and cell has a
// visible border, the head band is the document's accent colour (lib/reports
// `accentHex`), and status-ish cells are tinted with the shared tone palette
// (`statusTone`) — the same colour coding the print documents use, so a
// report looks the same whichever button produced it.

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toneFill = (tone: Exclude<StatusTone, null>): RGB => hexToRgb(TONE_CSS[tone].bg);
const toneText = (tone: Exclude<StatusTone, null>): RGB => hexToRgb(TONE_CSS[tone].fg);

const GRID_LINE: RGB = [120, 126, 134];

function addHeader(doc: jsPDF, title: string, subtitle: string | undefined, accent: RGB) {
  const w = doc.internal.pageSize.getWidth();
  // Accent band across the top — how you tell one document type from another.
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, w, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(title, 40, 44);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(subtitle, 40, 62);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(new Date().toLocaleString(), w - 40, 44, { align: "right" });

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(1.5);
  doc.line(40, 72, w - 40, 72);
  doc.setTextColor(0);
}

/**
 * The brand line every document this app generates carries, plus the colour
 * key and page numbers. Called last so it can stamp every page.
 */
function addFooter(doc: jsPDF, withColorKey: boolean) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.setDrawColor(210);
    doc.setLineWidth(0.5);
    doc.line(40, h - 34, w - 40, h - 34);
    doc.setFont("helvetica", "normal");
    if (withColorKey) {
      doc.setFontSize(6.5);
      doc.setTextColor(150);
      doc.text(COLOR_KEY, 40, h - 26);
    }
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(BRAND_FOOTER, 40, h - 14);
    doc.text(`Page ${i} of ${pageCount}`, w - 40, h - 14, { align: "right" });
    doc.setTextColor(0);
  }
}

/** Shared autoTable styling: real borders on every cell + tone-tinted values. */
function tableOptions(accent: RGB) {
  return {
    theme: "grid" as const,
    styles: {
      fontSize: 8,
      cellPadding: 5,
      lineColor: GRID_LINE,
      lineWidth: 0.5,
      overflow: "linebreak" as const,
      valign: "top" as const,
    },
    headStyles: {
      fillColor: accent,
      textColor: [255, 255, 255] as RGB,
      fontStyle: "bold" as const,
      lineColor: accent,
      lineWidth: 0.5,
    },
    alternateRowStyles: { fillColor: [244, 245, 247] as RGB },
    margin: { left: 40, right: 40, bottom: 46 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const raw = Array.isArray(data.cell.raw) ? data.cell.raw[0] : data.cell.raw;
      const tone = statusTone(String(raw ?? ""));
      if (!tone) return;
      data.cell.styles.fillColor = toneFill(tone);
      data.cell.styles.textColor = toneText(tone);
      data.cell.styles.fontStyle = "bold";
    },
  };
}

/** A tabular report (same `ReportTable` the CSV/print exports use) as a real PDF. */
export function buildTablePdf(
  title: string,
  subtitle: string,
  table: ReportTable,
  kind?: string
): jsPDF {
  const accent = hexToRgb(accentHex(kind ?? title));
  // Wide tables get landscape automatically — the old portrait-only default is
  // what made a 10-column report come out as unreadable slivers.
  const landscape = table.columns.length > 7;
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: landscape ? "landscape" : "portrait",
  });
  addHeader(doc, title, subtitle, accent);
  autoTable(doc, {
    startY: 84,
    head: [table.columns],
    body: table.rows,
    ...tableOptions(accent),
  });
  addFooter(doc, true);
  return doc;
}

export interface EntitySection {
  heading: string;
  /** Label/value pairs, drawn as a bordered two-column table. */
  rows?: [string, string][];
  /** Free text (a scene's script, a long note) — drawn as a wrapped block. */
  text?: string;
}

/** A single-record detail sheet — scene, location, cast member, wardrobe piece… */
export function buildEntityPdf(
  title: string,
  subtitle: string | undefined,
  sections: EntitySection[],
  kind?: string
): jsPDF {
  const accent = hexToRgb(accentHex(kind ?? title));
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  addHeader(doc, title, subtitle, accent);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 96;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageH - 60) {
      doc.addPage();
      y = 60;
    }
  };

  for (const section of sections) {
    ensureRoom(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(section.heading.toUpperCase(), 40, y);
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(0.8);
    doc.line(40, y + 4, pageW - 40, y + 4);
    doc.setTextColor(0);
    y += 12;

    if (section.text) {
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(section.text, pageW - 80) as string[];
      for (const line of lines) {
        ensureRoom(14);
        doc.text(line, 40, y + 10);
        y += 12;
      }
      y += 12;
      doc.setFont("helvetica", "normal");
    }

    if (section.rows && section.rows.length) {
      autoTable(doc, {
        startY: y,
        body: section.rows,
        ...tableOptions(accent),
        styles: {
          ...tableOptions(accent).styles,
          fontSize: 9,
          cellPadding: 4,
        },
        columnStyles: {
          0: { fontStyle: "bold", cellWidth: 140, fillColor: [240, 241, 244] },
        },
      });
      // @ts-expect-error lastAutoTable is attached by the plugin at runtime
      y = doc.lastAutoTable.finalY + 22;
    }
  }
  addFooter(doc, true);
  return doc;
}

/** `Sample-Film_Scene-12A_2026-07-31.pdf` — always English, never an empty slug. */
export function pdfFilename(projectTitle: string, kind: string): string {
  return exportFilename(projectTitle, kind, "pdf");
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function pdfBlob(doc: jsPDF): Blob {
  return doc.output("blob");
}

import React, { useEffect, useRef, useState } from "react";
import { Share2, Copy, MessageCircle, FileDown } from "lucide-react";
import type { jsPDF } from "jspdf";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { copyShareText, openWhatsAppShare } from "@/lib/share";
import { downloadPdf } from "@/lib/pdfExport";
import { pushToast } from "@/lib/toast";

interface ShareMenuProps {
  /** Plain-text summary — copied, and used as the WhatsApp message body. */
  buildText: () => string;
  /** Optional: builds a real PDF for download / to attach manually to WhatsApp. */
  buildPdf?: () => { doc: jsPDF; filename: string };
  size?: "sm" | "md";
  className?: string;
}

/**
 * A small share/export dropdown reused across every shareable entity — scenes,
 * locations, cast, wardrobe pieces, assets, reports. Three actions: copy the
 * text summary, open WhatsApp with it pre-filled, or download a real PDF.
 * WhatsApp's click-to-chat API can't attach a file, so "Share via WhatsApp"
 * also downloads the PDF (when available) and tells the user to attach it.
 */
export function ShareMenu({ buildText, buildPdf, size = "sm", className }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyShareText(buildText());
    pushToast(
      ok
        ? { title: "Copied to clipboard", tone: "success" }
        : { title: "Couldn't copy", description: "Clipboard access was blocked", tone: "danger" }
    );
    setOpen(false);
  };

  const handleWhatsApp = () => {
    if (buildPdf) {
      const { doc, filename } = buildPdf();
      downloadPdf(doc, filename);
      pushToast({
        title: "PDF downloaded",
        description: `Attach "${filename}" in WhatsApp — the web link can only pre-fill text`,
        tone: "default",
      });
    }
    openWhatsAppShare(buildText());
    setOpen(false);
  };

  const handleDownloadPdf = () => {
    if (!buildPdf) return;
    const { doc, filename } = buildPdf();
    downloadPdf(doc, filename);
    pushToast({ title: "PDF downloaded", description: filename, tone: "success" });
    setOpen(false);
  };

  return (
    <div className={cn("relative inline-block", className)} ref={ref}>
      <Button
        variant="ghost"
        size={size}
        aria-label="Share"
        onClick={() => setOpen((o) => !o)}
      >
        <Share2 size={14} />
      </Button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-56 rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl py-1"
          role="menu"
        >
          <MenuItem icon={<Copy size={14} />} label="Copy text" onClick={handleCopy} />
          <MenuItem icon={<MessageCircle size={14} />} label="Share via WhatsApp" onClick={handleWhatsApp} />
          {buildPdf && (
            <MenuItem icon={<FileDown size={14} />} label="Download PDF" onClick={handleDownloadPdf} />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-left"
    >
      {icon}
      {label}
    </button>
  );
}

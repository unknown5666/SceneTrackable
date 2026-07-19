import React from "react";
import { useNavigate } from "react-router-dom";
import { HelpCircle } from "lucide-react";

/**
 * Contextual help affordance for a page header. Opens the Help hub's handbook
 * at this page's doc. `doc` is a HandbookDoc id (see src/data/handbook.ts).
 */
export function HelpButton({ doc, className }: { doc: string; className?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      aria-label="Help for this page"
      title="Help for this page"
      onClick={() => nav(`/tutorial?tab=handbook&doc=${doc}`)}
      className={
        "inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-blue)] hover:bg-[var(--bg-surface-hover)] transition-colors " +
        (className ?? "")
      }
    >
      <HelpCircle size={16} />
    </button>
  );
}

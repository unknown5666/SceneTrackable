import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
  /** A faded mini-preview of the filled state, shown above the title. */
  preview?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, subtitle, cta, preview, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
    >
      {preview ? (
        <div className="relative mb-6 w-full max-w-sm pointer-events-none select-none">
          <div className="opacity-40">{preview}</div>
          {/* fade the preview into the page so it reads as a ghost of the real thing */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, transparent 40%, var(--bg-surface) 100%)",
            }}
          />
        </div>
      ) : (
        icon && (
          <div
            className="mb-4 flex items-center justify-center rounded-2xl"
            style={{
              width: 72,
              height: 72,
              background: "color-mix(in srgb, var(--accent-blue) 8%, transparent)",
              color: "var(--accent-blue)",
            }}
          >
            {icon}
          </div>
        )
      )}
      <div className="text-base font-medium text-[var(--text-primary)]">{title}</div>
      {subtitle && (
        <div className="text-sm text-[var(--text-secondary)] mt-1 max-w-md">
          {subtitle}
        </div>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

/**
 * A generic ghost-preview: a few faded rows/cards, for empty-state previews that
 * don't warrant a bespoke illustration. Compose with EmptyState's `preview`.
 */
export function GhostRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] p-3 bg-[var(--bg-surface)]"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface-hover)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 rounded bg-[var(--bg-surface-hover)]" style={{ width: `${70 - i * 12}%` }} />
            <div className="h-2 rounded bg-[var(--bg-surface-hover)]" style={{ width: `${45 - i * 8}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

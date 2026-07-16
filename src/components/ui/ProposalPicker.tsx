import React from "react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { cn } from "@/lib/utils";

/**
 * AI output is always a proposal the user reviews and accepts — never a silent
 * write. Every feature that proposes records (locations, cast, tasks, shoot
 * days) shows the same reviewable list, so this is that list.
 */

export interface ProposalItem {
  /** Stable identity for selection. */
  key: string;
  label: React.ReactNode;
  /** Secondary line — what this record will contain. */
  detail?: React.ReactNode;
  /** Right-hand chip, e.g. a category or scene count. */
  badge?: React.ReactNode;
  /** Already exists — shown, greyed, and not selectable. */
  existing?: boolean;
  /** Why it can't be selected, shown in place of the checkbox state. */
  existingLabel?: string;
}

export function ProposalPicker({
  items,
  selected,
  onChange,
  emptyMessage = "Nothing to propose.",
  groupLabel,
  className,
}: {
  items: ProposalItem[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  emptyMessage?: string;
  /** Heading above the list, e.g. a department name. */
  groupLabel?: React.ReactNode;
  className?: string;
}) {
  const selectable = items.filter((i) => !i.existing);
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.key));

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const toggleAll = () => {
    const next = new Set(selected);
    for (const i of selectable) {
      if (allSelected) next.delete(i.key);
      else next.add(i.key);
    }
    onChange(next);
  };

  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--text-muted)] py-6 text-center">{emptyMessage}</div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="section-header">{groupLabel}</div>
        {selectable.length > 0 && (
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        )}
      </div>
      <div className="rounded-card border border-[var(--border-default)] divide-y divide-[var(--border-default)] max-h-[320px] overflow-y-auto">
        {items.map((item) => (
          <label
            key={item.key}
            className={cn(
              "flex items-start gap-3 p-2.5 text-sm",
              item.existing
                ? "opacity-55"
                : "cursor-pointer hover:bg-[var(--bg-surface-hover)]"
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              disabled={item.existing}
              checked={!item.existing && selected.has(item.key)}
              onChange={() => toggle(item.key)}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[var(--text-primary)] font-medium truncate">{item.label}</div>
              {item.detail && (
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">{item.detail}</div>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              {item.badge}
              {item.existing && (
                <Badge tone="muted">{item.existingLabel ?? "Already added"}</Badge>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Selection state that starts with every new (non-existing) item checked. */
export function defaultSelection(items: ProposalItem[]): Set<string> {
  return new Set(items.filter((i) => !i.existing).map((i) => i.key));
}

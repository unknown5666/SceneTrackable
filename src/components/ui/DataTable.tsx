import React from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  /** Width class, e.g. "w-40". */
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when there are no rows and no loading/error. */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  /** Rows to render as skeletons while loading. */
  skeletonRows?: number;
}

/**
 * One table pattern for the whole app: sticky header, hover rows, tabular-nums,
 * and consistent loading (shimmer) / empty / error surfaces so no async table
 * ever flashes blank or dead-ends. Scrolls inside its own container.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  rowClassName,
  className,
  skeletonRows = 6,
}: DataTableProps<T>) {
  const alignCls = (a?: Column<T>["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  if (error) {
    return (
      <div className={cn("rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)]", className)}>
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Couldn't load this"
          subtitle={error}
          cta={
            onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-x-auto",
        className
      )}
    >
      {/* `st-datatable` picks up the same compact-density padding as `.pos-table`
          (see index.css). Zebra + hover below mirror the pos-table look so the
          two render as one table pattern. */}
      <table className="st-datatable w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "sticky top-0 z-10 bg-[var(--bg-surface)] px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-secondary)] border-b border-[var(--border-default)]",
                  alignCls(c.align),
                  c.width
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`sk_${i}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    <Skeleton className="h-4" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? (
                  <div className="py-10 text-center text-sm text-[var(--text-muted)]">Nothing here yet.</div>
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={keyOf(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "transition-colors even:bg-[var(--row-alt)] hover:bg-[var(--row-hover)]",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row)
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-4 py-3 text-[var(--text-primary)] tabular-nums", alignCls(c.align), c.className)}
                  >
                    {c.render ? c.render(row, i) : (row as Record<string, React.ReactNode>)[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

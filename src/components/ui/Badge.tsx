import React from "react";
import { cn } from "@/lib/utils";

type Tone =
  | "neutral"
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "ai"
  | "muted";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
}

const tones: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: {
    bg: "bg-[rgba(79,123,247,0.1)]",
    fg: "text-[var(--accent-blue)]",
    dot: "bg-[var(--accent-blue)]",
  },
  info: {
    bg: "bg-[rgba(79,123,247,0.1)]",
    fg: "text-[var(--accent-blue)]",
    dot: "bg-[var(--accent-blue)]",
  },
  success: {
    bg: "bg-[rgba(34,197,94,0.1)]",
    fg: "text-[var(--color-success)]",
    dot: "bg-[var(--color-success)]",
  },
  warning: {
    bg: "bg-[rgba(245,158,11,0.1)]",
    fg: "text-[var(--color-warning)]",
    dot: "bg-[var(--color-warning)]",
  },
  danger: {
    bg: "bg-[rgba(239,68,68,0.1)]",
    fg: "text-[var(--color-danger)]",
    dot: "bg-[var(--color-danger)]",
  },
  ai: {
    bg: "bg-[rgba(139,92,246,0.12)]",
    fg: "text-[var(--color-ai)]",
    dot: "bg-[var(--color-ai)]",
  },
  muted: {
    bg: "bg-[var(--bg-surface-hover)]",
    fg: "text-[var(--text-muted)]",
    dot: "bg-[var(--text-muted)]",
  },
};

export function Badge({
  tone = "neutral",
  dot,
  pulse,
  className,
  children,
  ...rest
}: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-badge text-xs font-medium",
        t.bg,
        t.fg,
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full", t.dot, pulse && "pulse-dot")}
        />
      )}
      {children}
    </span>
  );
}

// ------------------------------------------------------------
// Status-specific
// ------------------------------------------------------------

export function StatusBadge({
  status,
}: {
  status:
    | "completed"
    | "in_progress"
    | "review"
    | "at_risk"
    | "overdue"
    | "blocked"
    | "not_started";
}) {
  const map = {
    completed: { tone: "success" as const, label: "Completed" },
    in_progress: { tone: "info" as const, label: "In progress" },
    review: { tone: "warning" as const, label: "Review" },
    at_risk: { tone: "warning" as const, label: "At risk" },
    overdue: { tone: "danger" as const, label: "Overdue" },
    blocked: { tone: "danger" as const, label: "Blocked" },
    not_started: { tone: "muted" as const, label: "Not started" },
  };
  const m = map[status];
  return (
    <Badge tone={m.tone} dot pulse={status === "blocked"}>
      {m.label}
    </Badge>
  );
}

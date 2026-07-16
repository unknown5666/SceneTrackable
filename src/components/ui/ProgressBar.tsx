import React from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  tone?: "success" | "warning" | "danger" | "neutral";
  height?: number;
  className?: string;
  showLabel?: boolean;
}

const toneMap = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  neutral: "var(--accent-blue)",
};

export function ProgressBar({
  value,
  tone = "neutral",
  height = 6,
  className,
  showLabel,
}: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full", className)}>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{
          height,
          background: "var(--bg-surface-hover)",
        }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, background: toneMap[tone] }}
        />
      </div>
      {showLabel && (
        <div className="text-xs text-[var(--text-secondary)] mt-1 text-right">
          {v.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, subtitle, cta, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
    >
      {icon && (
        <div className="text-[var(--text-muted)] mb-4" style={{ fontSize: 48 }}>
          {icon}
        </div>
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

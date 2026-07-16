import React from "react";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "ai";
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", padding = "md", className, children, ...rest }, ref) => {
    const variantClasses =
      variant === "ai"
        ? "border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.04)]"
        : variant === "elevated"
        ? "bg-[var(--bg-elevated)]"
        : "bg-[var(--bg-surface)]";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-card border border-[var(--border-default)] transition-colors hover:border-[var(--border-hover)]",
          paddingMap[padding],
          variantClasses,
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between mb-3", className)}>
      <div>
        <div className="section-header">{title}</div>
        {subtitle && (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

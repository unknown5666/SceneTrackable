import React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "ai";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const base = "inline-flex items-center justify-center gap-2 font-medium rounded-button transition-all whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent-blue)] text-white hover:opacity-90 active:opacity-80",
  secondary:
    "bg-transparent text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface-hover)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]",
  destructive:
    "bg-[rgba(239,68,68,0.1)] text-[var(--color-danger)] hover:bg-[rgba(239,68,68,0.15)] border border-transparent",
  ai:
    "bg-[rgba(139,92,246,0.12)] text-[var(--color-ai)] border border-[rgba(139,92,246,0.25)] hover:bg-[rgba(139,92,246,0.2)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, leftIcon, rightIcon, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={rest.disabled || loading}
        {...rest}
      >
        {loading ? (
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

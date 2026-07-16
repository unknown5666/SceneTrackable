import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "modal" | "drawer";
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  variant = "modal",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sizeMap = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-in"
      style={{ background: "var(--overlay)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className={cn(
          "rounded-card border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl w-[92vw]",
          variant === "drawer" ? "max-w-[420px]" : sizeMap[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-[var(--border-default)]">
          <div>
            {title && <div className="page-title text-lg">{title}</div>}
            {subtitle && (
              <div className="text-xs text-[var(--text-secondary)] mt-1">{subtitle}</div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="p-4 border-t border-[var(--border-default)] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

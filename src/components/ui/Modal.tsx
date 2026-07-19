import React, { useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { backdropVariants, modalPanelVariants } from "@/lib/motion";

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
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sizeMap = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  const isDrawer = variant === "drawer";

  // Drawers slide from the right; modals scale + fade. Reduced motion → fade only.
  const panelVariants = reduce
    ? backdropVariants
    : isDrawer
      ? {
          initial: { opacity: 0, x: 40 },
          animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
          exit: { opacity: 0, x: 40, transition: { duration: 0.16 } },
        }
      : modalPanelVariants;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0 z-50 flex",
            isDrawer ? "justify-end" : "items-center justify-center"
          )}
          style={{ background: "var(--overlay)", backdropFilter: "blur(4px)" }}
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className={cn(
              "border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl",
              isDrawer
                ? "h-full w-[92vw] max-w-[440px] rounded-l-card flex flex-col"
                : cn("rounded-card w-[92vw]", sizeMap[size])
            )}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
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
            <div className={cn("p-5 overflow-y-auto", isDrawer ? "flex-1" : "max-h-[70vh]")}>
              {children}
            </div>
            {footer && (
              <div className="p-4 border-t border-[var(--border-default)] flex justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

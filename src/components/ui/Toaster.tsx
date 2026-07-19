import React, { useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, AlertTriangle, Info, Sparkles, Undo2 } from "lucide-react";
import {
  subscribeToasts,
  getToasts,
  dismissToast,
  type Toast,
  type ToastTone,
} from "@/lib/toast";

const TONE: Record<ToastTone, { icon: React.ReactNode; color: string }> = {
  default: { icon: <Info size={15} />, color: "var(--accent-blue)" },
  success: { icon: <Check size={15} />, color: "var(--color-success)" },
  danger: { icon: <AlertTriangle size={15} />, color: "var(--color-danger)" },
  warning: { icon: <AlertTriangle size={15} />, color: "var(--color-warning)" },
  ai: { icon: <Sparkles size={15} />, color: "var(--color-ai)" },
};

/** Global top-right toast queue. Mounted once in the authenticated layout. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  return (
    <div className="fixed top-4 right-4 z-[110] flex flex-col gap-2 w-[340px] max-w-[92vw] pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const tone = TONE[toast.tone ?? "default"];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="pointer-events-auto rounded-card border border-[var(--border-default)] shadow-xl p-3 flex items-start gap-2.5"
      style={{ background: "var(--bg-elevated)" }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: tone.color }}>
        {tone.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">{toast.title}</div>
        {toast.description && (
          <div className="text-xs text-[var(--text-secondary)] mt-0.5">{toast.description}</div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.run();
              dismissToast(toast.id);
            }}
            className="mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium bg-[var(--bg-surface-hover)] text-[var(--text-primary)] hover:bg-[var(--active-tint)] transition-colors"
          >
            <Undo2 size={12} /> {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ============================================================
// TOASTS — a tiny framework-agnostic queue.
//
// Deliberately outside the Zustand store (and its cloud sync): toasts are
// ephemeral UI, never persisted or shared. The store and any component can call
// `pushToast`; <Toaster /> renders the queue. Deletes pass an Undo action.
// ============================================================

export type ToastTone = "default" | "success" | "danger" | "ai" | "warning";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** ms before auto-dismiss; 0 = sticky. */
  duration: number;
  createdAt: number;
}

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: ToastAction;
  duration?: number;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  // New array identity so useSyncExternalStore re-renders.
  toasts = toasts.slice();
  for (const l of listeners) l();
}

export function subscribeToasts(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getToasts(): Toast[] {
  return toasts;
}

export function dismissToast(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

export function pushToast(input: ToastInput): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const duration = input.duration ?? (input.action ? 6000 : 3500);
  const toast: Toast = {
    id,
    title: input.title,
    description: input.description,
    tone: input.tone ?? "default",
    action: input.action,
    duration,
    createdAt: Date.now(),
  };
  // Cap the queue so a burst can't flood the screen.
  toasts = [...toasts, toast].slice(-5);
  emit();
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration)
    );
  }
  return id;
}

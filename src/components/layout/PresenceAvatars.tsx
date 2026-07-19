import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { History } from "lucide-react";
import { useStore, isCurrentAdmin } from "@/state/store";
import { cloudEnabled } from "@/lib/cloud";
import { useCloudStatus } from "./CloudIndicator";
import { IdentityAvatar } from "@/components/ui/IdentityAvatar";
import { menuVariants } from "@/lib/motion";

/**
 * Figma-style presence bubbles for teammates currently online. Reads the live
 * presence list from cloud status; each person gets their gradient identity
 * avatar with a green online ring. Clicking opens a popover with the full
 * roster (names + "you"), and — for admins — a jump to the activity log.
 */
export function PresenceAvatars() {
  const status = useCloudStatus();
  const users = useStore((s) => s.users);
  const isAdmin = useStore(isCurrentAdmin);
  const nav = useNavigate();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!cloudEnabled || !status.live) return null;

  const online = status.onlineUsers ?? [];
  if (online.length === 0) return null;

  // Resolve usernames → identity (id for the gradient, display name for label).
  const people = online.map((username) => {
    const u = users.find((x) => x.username.toLowerCase() === username.toLowerCase());
    const isSelf = status.username?.toLowerCase() === username.toLowerCase();
    return {
      id: u?.id ?? username,
      name: u?.displayName ?? username,
      isSelf,
    };
  });

  const shown = people.slice(0, 4);
  const extra = people.length - shown.length;

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center pl-1 pr-1.5 hover:opacity-90 transition-opacity"
        title={`${people.length} online — ${people.map((p) => p.name + (p.isSelf ? " (you)" : "")).join(", ")}`}
        aria-label={`${people.length} teammate${people.length === 1 ? "" : "s"} online`}
      >
        <AnimatePresence initial={false}>
          {shown.map((p, i) => (
            <motion.div
              key={p.id}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}
              className="relative"
            >
              <IdentityAvatar id={p.id} name={p.name} size={26} ring="var(--color-success)" title={p.name} />
            </motion.div>
          ))}
        </AnimatePresence>
        {extra > 0 && (
          <span
            className="relative flex items-center justify-center rounded-full text-[10px] font-semibold text-[var(--text-secondary)]"
            style={{
              width: 26,
              height: 26,
              marginLeft: -8,
              background: "var(--bg-elevated)",
              boxShadow: "0 0 0 2px var(--bg-base)",
            }}
          >
            +{extra}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-0 top-full mt-2 w-60 rounded-card border border-[var(--border-default)] z-50 overflow-hidden origin-top-right"
            style={{ background: "var(--bg-elevated)" }}
            variants={menuVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
              <div className="section-header">Online now</div>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "var(--color-success)" }} />
                {people.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                  <IdentityAvatar id={p.id} name={p.name} size={24} ring="var(--color-success)" />
                  <span className="text-sm text-[var(--text-primary)] truncate">
                    {p.name}
                    {p.isSelf && <span className="text-[var(--text-muted)]"> (you)</span>}
                  </span>
                </div>
              ))}
            </div>
            {isAdmin && (
              <div className="p-2 border-t border-[var(--border-default)]">
                <button
                  onClick={() => {
                    nav("/activity");
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
                >
                  <History size={13} /> View activity log
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

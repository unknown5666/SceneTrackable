import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/state/store";
import { cloudEnabled } from "@/lib/cloud";
import { useCloudStatus } from "./CloudIndicator";
import { IdentityAvatar } from "@/components/ui/IdentityAvatar";

/**
 * Figma-style presence bubbles for teammates currently online. Reads the live
 * presence list from cloud status; each person gets their gradient identity
 * avatar with a green online ring. Overlapping, capped, with a +N overflow.
 */
export function PresenceAvatars() {
  const status = useCloudStatus();
  const users = useStore((s) => s.users);

  if (!cloudEnabled || !status.live) return null;

  const online = status.onlineUsers ?? [];
  if (online.length === 0) return null;

  // Resolve usernames → identity (id for the gradient, display name for label).
  const people = online.map((username) => {
    const u = users.find((x) => x.username.toLowerCase() === username.toLowerCase());
    const isSelf = status.username?.toLowerCase() === username.toLowerCase();
    return {
      id: u?.id ?? username,
      name: (u?.displayName ?? username) + (isSelf ? " (you)" : ""),
    };
  });

  const shown = people.slice(0, 4);
  const extra = people.length - shown.length;

  return (
    <div className="hidden md:flex items-center pl-1 pr-1.5" title={people.map((p) => p.name).join(", ")}>
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
    </div>
  );
}

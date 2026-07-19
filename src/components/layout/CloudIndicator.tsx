// ============================================================
// CLOUD INDICATOR + CONFLICT BANNER
//
// Sync is automatic and invisible while it's working; this surfaces it only
// when there's something the user would want to know — pending edits, an
// error, or another person's changes that can't be applied silently.
// ============================================================

import React, { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  cloudEnabled,
  getCloudStatus,
  subscribeCloud,
  syncNow,
  resolveConflictKeepLocal,
  resolveConflictTakeRemote,
  type CloudStatus,
} from "@/lib/cloud";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";

export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore(subscribeCloud, getCloudStatus, getCloudStatus);
}

/** Compact status pill for the top bar. */
export function CloudIndicator() {
  const status = useCloudStatus();
  const nav = useNavigate();
  const [spinning, setSpinning] = useState(false);

  if (!cloudEnabled) return null;

  const click = async () => {
    if (status.conflict) {
      nav("/admin?tab=cloud");
      return;
    }
    setSpinning(true);
    try {
      await syncNow();
    } finally {
      setSpinning(false);
    }
  };

  const { icon, label, tone } = describe(status, spinning);

  return (
    <button
      onClick={click}
      title={
        status.lastSyncedAt
          ? `Last synced ${formatDateTime(status.lastSyncedAt)}`
          : "Not synced yet"
      }
      className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-[var(--border-default)] hover:border-[var(--text-muted)] transition-colors"
      style={{ color: tone }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function describe(status: CloudStatus, spinning: boolean) {
  if (status.conflict)
    return {
      icon: <AlertTriangle size={13} />,
      label: "Conflict",
      tone: "var(--color-danger)",
    };
  if (status.phase === "error")
    return { icon: <CloudOff size={13} />, label: "Sync error", tone: "var(--color-danger)" };
  if (status.phase !== "connected")
    return { icon: <CloudOff size={13} />, label: "Offline", tone: "var(--text-muted)" };
  if (spinning || status.pushing)
    return {
      icon: <Loader2 size={13} className="animate-spin" />,
      label: "Syncing…",
      tone: "var(--text-secondary)",
    };
  if (status.dirty)
    return { icon: <RefreshCw size={13} />, label: "Pending", tone: "var(--text-secondary)" };
  return { icon: <Check size={13} />, label: "Synced", tone: "var(--color-success)" };
}

/**
 * Full-width banner for the one case sync can't decide on its own: the
 * workspace moved on while this device had unpushed edits.
 */
export function CloudConflictBanner() {
  const status = useCloudStatus();
  const [busy, setBusy] = useState<"remote" | "local" | null>(null);

  if (!status.conflict) return null;
  const who = status.conflict.byName ?? "Someone else";

  const run = async (which: "remote" | "local") => {
    setBusy(which);
    try {
      if (which === "remote") await resolveConflictTakeRemote();
      else await resolveConflictKeepLocal();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="mx-6 mt-4 rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3"
      style={{ borderColor: "var(--color-danger)", background: "color-mix(in srgb, var(--color-danger) 8%, transparent)" }}
    >
      <AlertTriangle size={16} className="text-[var(--color-danger)] shrink-0" />
      <div className="flex-1 min-w-[240px]">
        <div className="text-sm font-medium text-[var(--text-primary)]">
          {who} saved changes while you were editing
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
          {status.conflict.at ? `Their version was saved ${formatDateTime(status.conflict.at)}. ` : ""}
          You both changed the workspace, so nothing has been overwritten — pick which version wins.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run("remote")}>
          {busy === "remote" ? "Loading…" : "Use their version"}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={() => run("local")}>
          {busy === "local" ? "Saving…" : "Keep my changes"}
        </Button>
      </div>
    </div>
  );
}

/** Warn before closing the tab with edits that never made it to the cloud. */
export function useUnsavedCloudGuard(): void {
  const status = useCloudStatus();
  useEffect(() => {
    if (!cloudEnabled) return;
    const risky = status.dirty || Boolean(status.conflict);
    if (!risky) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status.dirty, status.conflict]);
}

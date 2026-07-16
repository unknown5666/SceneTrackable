// ============================================================
// CLOUD PAGE
//
// There is no cloud login here any more — signing into SceneTrackable is
// what connects you. This page just explains what sync is doing and gives
// an escape hatch when it needs a human decision.
// ============================================================

import React, { useState } from "react";
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Users,
} from "lucide-react";
import {
  cloudEnabled,
  pushWorkspace,
  pullWorkspace,
  syncNow,
  resolveConflictKeepLocal,
  resolveConflictTakeRemote,
} from "@/lib/cloud";
import { useCloudStatus } from "@/components/layout/CloudIndicator";
import { useStore, currentUser } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";

export function CloudSync() {
  const status = useCloudStatus();
  const user = useStore(currentUser);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const run = async (fn: () => Promise<string | null | void>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const err = (await fn()) ?? null;
      setMsg(err ? { tone: "err", text: err } : { tone: "ok", text: okText });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Cloud size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header">Cloud</div>
          <div className="page-title">Cloud Sync</div>
        </div>
      </div>

      {!cloudEnabled ? (
        <Card>
          <CardHeader
            title="Not configured yet"
            subtitle="Cloud sync activates when Supabase credentials are provided at build time. Until then SceneTrackable runs entirely in this browser."
          />
          <ol className="text-sm text-[var(--text-secondary)] space-y-2 list-decimal list-inside">
            <li>Create a free project at <span className="font-mono text-xs">supabase.com</span>.</li>
            <li>
              In the Supabase SQL Editor, run the contents of{" "}
              <span className="font-mono text-xs">supabase/schema.sql</span> (in this repo).
            </li>
            <li>
              Turn <span className="font-medium">off</span> Authentication → Providers → Email →{" "}
              <span className="font-mono text-xs">Confirm email</span>. SceneTrackable creates device
              accounts silently and cannot click a confirmation link.
            </li>
            <li>Copy the project URL and anon key from Project Settings → API.</li>
            <li>
              Set <span className="font-mono text-xs">VITE_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</span> in a local{" "}
              <span className="font-mono text-xs">.env</span> file (and in your host's environment
              variables for the deployed app).
            </li>
            <li>
              Rebuild / redeploy, then sign in as your admin straight away — the first person to
              sign in claims the shared workspace.
            </li>
          </ol>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-start justify-between gap-4">
              <CardHeader
                title={status.phase === "connected" ? "Connected" : "Not connected"}
                subtitle={
                  status.phase === "connected"
                    ? `This device is syncing as ${status.username ?? user?.username ?? "—"}. Everyone on the team shares one workspace.`
                    : status.error ??
                      "Sync attaches automatically when you sign in. If this persists, check the Supabase setup."
                }
                className="mb-0"
              />
              <Badge tone={status.phase === "connected" ? "success" : "danger"} dot>
                {status.phase === "connected" ? "Cloud active" : "Offline"}
              </Badge>
            </div>
          </Card>

          {status.conflict && (
            <Card>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle size={16} className="text-[var(--color-danger)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {status.conflict.byName ?? "Someone else"} saved changes while you were editing
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    Their version landed
                    {status.conflict.at ? ` ${formatDateTime(status.conflict.at)}` : ""} and you have
                    unsaved edits of your own. Nothing has been overwritten. Choosing "use their
                    version" discards your local edits; "keep mine" replaces theirs.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(resolveConflictTakeRemote, "Loaded the cloud version.")}
                >
                  Use their version
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(resolveConflictKeepLocal, "Your version is now the cloud copy.")}
                >
                  Keep my changes
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Status"
              subtitle={
                status.lastSyncedAt
                  ? `Last synced ${formatDateTime(status.lastSyncedAt)}`
                  : "Not synced yet on this device."
              }
            />
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="section-header mb-1">Local edits</dt>
                <dd className="text-[var(--text-primary)]">
                  {status.dirty ? "Pending upload" : "All saved"}
                </dd>
              </div>
              <div>
                <dt className="section-header mb-1">Workspace version</dt>
                <dd className="text-[var(--text-primary)]">{status.rev ?? "—"}</dd>
              </div>
              <div>
                <dt className="section-header mb-1">Checks for changes</dt>
                <dd className="text-[var(--text-primary)]">Every 3 min</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <Button onClick={() => run(syncNow, "Up to date.")} disabled={busy}>
                <RefreshCw size={14} /> Sync now
              </Button>
              <Button
                variant="secondary"
                onClick={() => run(() => pushWorkspace(), "Workspace uploaded.")}
                disabled={busy}
              >
                <CloudUpload size={14} /> Force upload
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    !confirm(
                      "This replaces everything in this browser with the cloud copy. Local changes that haven't uploaded will be lost. Continue?"
                    )
                  )
                    return;
                  void run(pullWorkspace, "Loaded the cloud copy.");
                }}
                disabled={busy}
              >
                <CloudDownload size={14} /> Force download
              </Button>
            </div>

            {msg && (
              <div
                className={`flex items-center gap-1.5 text-xs mt-3 ${
                  msg.tone === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                }`}
              >
                {msg.tone === "err" ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                {msg.text}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-2">
              <Users size={15} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <div className="font-medium text-[var(--text-primary)] mb-1">How sync works</div>
                Your edits upload about 8 seconds after you stop typing, and SceneTrackable checks
                for other people's changes every 3 minutes. If someone else has saved and you
                haven't touched anything, their changes load automatically. If you were both
                editing, you'll be asked which version to keep rather than having one silently
                overwrite the other. To add someone, invite them in Admin → Users — they sign in
                from anywhere with their username and land in this same workspace.
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

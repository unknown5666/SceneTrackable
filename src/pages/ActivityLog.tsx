import React, { useMemo, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";
import type { ActivityEntity, ActivityLogEntry } from "@/types";

const ENTITY_TONE: Record<ActivityEntity, "info" | "ai" | "warning" | "muted" | "danger" | "success"> = {
  task: "info",
  cast: "ai",
  crew: "info",
  user: "warning",
  role: "warning",
  timesheet: "success",
  dood: "ai",
  scene: "info",
  shoot_day: "info",
  schedule: "info",
  purchase_order: "warning",
  auth: "muted",
  project: "info",
  location: "info",
  art_element: "ai",
  vfx_shot: "ai",
  frequency: "info",
  rf_equipment: "info",
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  deleted: "Deleted",
  status_change: "Status",
  dood_set: "DOOD",
  hours_edited: "Hours",
  submitted: "Submitted",
  invited: "Invited",
  invite_reset: "Invite reset",
  invite_redeemed: "Invite redeemed",
  login: "Login",
  logout: "Logout",
};

export function ActivityLog() {
  const log = useStore((s) => s.activityLog);
  const clear = useStore((s) => s.clearActivityLog);
  const users = useStore((s) => s.users);

  const [filterEntity, setFilterEntity] = useState<"all" | ActivityEntity>("all");
  const [filterUser, setFilterUser] = useState<"all" | string>("all");

  const filtered = useMemo(() => {
    return log.filter((e) => {
      if (filterEntity !== "all" && e.entity !== filterEntity) return false;
      if (filterUser !== "all" && e.userId !== filterUser) return false;
      return true;
    });
  }, [log, filterEntity, filterUser]);

  const entities = useMemo(() => {
    const set = new Set<ActivityEntity>();
    for (const e of log) set.add(e.entity);
    return Array.from(set).sort();
  }, [log]);

  const activeUsers = useMemo(() => {
    const ids = new Set<string>();
    for (const e of log) if (e.userId) ids.add(e.userId);
    return users.filter((u) => ids.has(u.id));
  }, [log, users]);

  return (
    <div className="max-w-[1100px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-[var(--accent-blue)]" />
          <div>
            <div className="section-header">Audit</div>
            <div className="page-title">Activity Log</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {log.length} event{log.length === 1 ? "" : "s"} recorded (most recent first). Log is capped at 2000 entries.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value as typeof filterEntity)}
            className="h-9 text-xs"
          >
            <option value="all">All entities</option>
            {entities.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="h-9 text-xs"
          >
            <option value="all">All users</option>
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Clear the entire activity log? This can't be undone.")) clear();
            }}
            disabled={log.length === 0}
          >
            <Trash2 size={13} /> Clear
          </Button>
        </div>
      </div>

      {log.length === 0 ? (
        <EmptyState
          title="No activity yet"
          subtitle="As people create tasks, edit hours, and update the DOOD, every action shows up here with who did it and when."
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="pos-table text-sm">
              <thead>
                <tr>
                  <th className="min-w-[160px]">When</th>
                  <th className="min-w-[140px]">Who</th>
                  <th className="min-w-[110px]">Entity</th>
                  <th className="min-w-[110px]">Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <ActivityRow key={e.id} entry={e} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-xs text-[var(--text-muted)] py-8">
                      No events match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityLogEntry }) {
  return (
    <tr>
      <td className="text-xs text-[var(--text-muted)] whitespace-nowrap">
        {formatDateTime(entry.at)}
      </td>
      <td className="text-sm text-[var(--text-primary)]">{entry.userLabel || "System"}</td>
      <td>
        <Badge tone={ENTITY_TONE[entry.entity] ?? "muted"}>{entry.entity}</Badge>
      </td>
      <td className="text-xs text-[var(--text-secondary)]">
        {ACTION_LABEL[entry.action] ?? entry.action}
      </td>
      <td className="text-sm text-[var(--text-primary)]">{entry.description}</td>
    </tr>
  );
}

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Calendar,
  Clock,
  ListChecks,
  Check,
  Sparkles,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime, cn } from "@/lib/utils";
import type { NotificationType } from "@/types";

const NOTIF_ICON: Record<NotificationType, React.ReactNode> = {
  schedule_change: <Calendar size={16} className="text-[var(--accent-blue)]" />,
  deadline_shifted: <Clock size={16} className="text-[var(--color-warning)]" />,
  task_assigned: <ListChecks size={16} className="text-[var(--accent-blue)]" />,
  task_overdue: <AlertCircle size={16} className="text-[var(--color-danger)]" />,
  approval_requested: <DollarSign size={16} className="text-[var(--color-warning)]" />,
  approval_decided: <Check size={16} className="text-[var(--color-success)]" />,
  ai_digest: <Sparkles size={16} className="text-[var(--color-ai)]" />,
};

export function Notifications() {
  const nav = useNavigate();
  const notifications = useStore((s) => s.notifications);
  const activeRole = useStore((s) => s.activeRole);
  const markRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllRead);

  const relevant = notifications.filter(
    (n) => !n.forRoles || (activeRole && n.forRoles.includes(activeRole))
  );

  const unread = relevant.filter((n) => !n.read);

  // Group by "today" and "earlier"
  const today = new Date().toISOString().slice(0, 10);
  const todayNotifs = relevant.filter((n) => n.createdAt.slice(0, 10) === today);
  const earlierNotifs = relevant.filter((n) => n.createdAt.slice(0, 10) !== today);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="section-header">Notifications</div>
          <div className="page-title mt-1">Activity Feed</div>
        </div>
        {unread.length > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <Check size={14} /> Mark all read
          </Button>
        )}
      </div>

      {relevant.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell size={48} />}
            title="No notifications"
            subtitle="You're all caught up."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {todayNotifs.length > 0 && (
            <div>
              <div className="section-header mb-3">Today</div>
              <div className="space-y-1.5">
                {todayNotifs.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={markRead} onNav={nav} />
                ))}
              </div>
            </div>
          )}
          {earlierNotifs.length > 0 && (
            <div>
              <div className="section-header mb-3">Earlier</div>
              <div className="space-y-1.5">
                {earlierNotifs.map((n) => (
                  <NotifRow key={n.id} n={n} onRead={markRead} onNav={nav} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifRow({
  n,
  onRead,
  onNav,
}: {
  n: ReturnType<typeof useStore.getState>["notifications"][number];
  onRead: (id: string) => void;
  onNav: (to: string) => void;
}) {
  return (
    <button
      className={cn(
        "w-full text-left p-4 rounded-card border transition-colors flex items-start gap-3",
        n.read
          ? "border-[var(--border-default)] bg-[var(--bg-surface)]"
          : "border-[var(--accent-blue)] bg-[var(--active-tint)]"
      )}
      onClick={() => {
        onRead(n.id);
        if (n.linkTo) onNav(n.linkTo);
      }}
    >
      <div className="shrink-0 mt-0.5">
        {NOTIF_ICON[n.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">{n.title}</div>
        <div className="text-xs text-[var(--text-secondary)] mt-0.5">{n.body}</div>
        <div className="text-[10px] text-[var(--text-muted)] mt-1.5">{formatDateTime(n.createdAt)}</div>
      </div>
      {!n.read && (
        <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "var(--accent-blue)" }} />
      )}
    </button>
  );
}

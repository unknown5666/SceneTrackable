import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Sun, Moon, ChevronDown, LogOut, FolderKanban, Plus } from "lucide-react";
import { useStore, unreadCount, currentUser, currentRole, activeProject } from "@/state/store";
import { useTheme } from "@/state/theme";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";

export function TopBar() {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const user = useStore(currentUser);
  const role = useStore(currentRole);
  const project = useStore(activeProject);
  const unread = useStore(unreadCount);
  const notifications = useStore((s) => s.notifications);
  const logout = useStore((s) => s.logout);

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userOpen && userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen, userOpen]);

  const recent = notifications.slice(0, 8);
  const initials = (user?.displayName || "U").split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <header
      className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-[var(--border-default)]"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Project context */}
      <button
        onClick={() => nav("/projects")}
        className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
      >
        <FolderKanban size={16} className="text-[var(--text-muted)] shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
            {project ? project.name : "No project selected"}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            {project ? `${project.sceneCount} scenes · ${project.elementCount} elements` : "Create one to begin"}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => nav("/projects")}>
          <Plus size={14} /> New project
        </Button>

        <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button variant="ghost" size="sm" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications">
            <div className="relative">
              <Bell size={16} />
              {unread > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ background: "var(--color-danger)" }}
                />
              )}
            </div>
          </Button>
          {notifOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-80 rounded-card border border-[var(--border-default)] z-50 animate-in"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
                <div className="section-header">Notifications</div>
                {unread > 0 && <Badge tone="danger">{unread} new</Badge>}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recent.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[var(--text-muted)]">All caught up.</div>
                ) : (
                  recent.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        useStore.getState().markNotificationRead(n.id);
                        if (n.linkTo) nav(n.linkTo);
                        setNotifOpen(false);
                      }}
                      className="w-full text-left p-3 hover:bg-[var(--bg-surface-hover)] border-b border-[var(--border-default)] last:border-b-0"
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && (
                          <span
                            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ background: "var(--accent-blue)" }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate">{n.title}</div>
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">{n.body}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">{formatDateTime(n.createdAt)}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="p-2 border-t border-[var(--border-default)]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    nav("/notifications");
                    setNotifOpen(false);
                  }}
                >
                  View all
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <Button variant="secondary" size="sm" onClick={() => setUserOpen((v) => !v)}>
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            >
              {initials}
            </span>
            <span className="max-w-[120px] truncate">{user?.displayName}</span>
            <ChevronDown size={14} />
          </Button>
          {userOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-card border border-[var(--border-default)] z-50 animate-in overflow-hidden"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div className="p-3 border-b border-[var(--border-default)]">
                <div className="text-sm font-medium text-[var(--text-primary)]">{user?.displayName}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{role?.label}</div>
              </div>
              <button
                onClick={() => {
                  logout();
                  nav("/login", { replace: true });
                }}
                className="w-full flex items-center gap-2 p-3 text-sm text-[var(--text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)]"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

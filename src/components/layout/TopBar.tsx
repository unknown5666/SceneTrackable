import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronDown, LogOut, FolderKanban, Plus, Menu, Check, BookOpen, Settings as SettingsIcon } from "lucide-react";
import { useStore, unreadCount, currentUser, currentRole, activeProject } from "@/state/store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CountUp } from "@/components/ui/CountUp";
import { ProjectPoster } from "@/components/ui/ProjectPoster";
import { IdentityAvatar } from "@/components/ui/IdentityAvatar";
import { CloudIndicator } from "./CloudIndicator";
import { AIStatusPill } from "./AIStatusPill";
import { PresenceAvatars } from "./PresenceAvatars";
import { menuVariants } from "@/lib/motion";
import { formatDateTime } from "@/lib/utils";

interface TopBarProps {
  /** Opens the sidebar overlay below `lg`, where there is no rail to hover. */
  onOpenSidebar: () => void;
}

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const nav = useNavigate();
  const user = useStore(currentUser);
  const role = useStore(currentRole);
  const project = useStore(activeProject);
  const projects = useStore((s) => s.projects);
  const switchProject = useStore((s) => s.switchProject);
  const unread = useStore(unreadCount);
  const notifications = useStore((s) => s.notifications);
  const logout = useStore((s) => s.logout);

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [bellWiggle, setBellWiggle] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(unread);

  // A new notification wiggles the bell.
  useEffect(() => {
    if (unread > prevUnread.current) setBellWiggle((n) => n + 1);
    prevUnread.current = unread;
  }, [unread]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userOpen && userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (projectOpen && projectRef.current && !projectRef.current.contains(e.target as Node))
        setProjectOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [notifOpen, userOpen, projectOpen]);

  const recent = notifications.slice(0, 8);
  const initials = (user?.displayName || "U").split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <header
      className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 border-b border-[var(--border-default)]"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="lg:hidden text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
        >
          <Menu size={18} />
        </button>

        {/* Project switcher */}
        <div className="relative min-w-0" ref={projectRef} data-tour="project-switcher">
          <button
            onClick={() => setProjectOpen((v) => !v)}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
          >
            {project ? (
              <ProjectPoster id={project.id} name={project.name} size={32} glyph />
            ) : (
              <FolderKanban size={16} className="text-[var(--text-muted)] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                {project ? project.name : "No project selected"}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider truncate tabular-nums">
                {project ? (
                  <>
                    <CountUp value={project.sceneCount} durationMs={500} /> scenes ·{" "}
                    <CountUp value={project.elementCount} durationMs={500} /> elements
                  </>
                ) : (
                  "Create one to begin"
                )}
              </div>
            </div>
            <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
          </button>
          <AnimatePresence>
            {projectOpen && (
              <motion.div
                className="absolute left-0 top-full mt-2 w-72 rounded-card border border-[var(--border-default)] z-50 overflow-hidden origin-top-left"
                style={{ background: "var(--bg-elevated)" }}
                variants={menuVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="p-3 border-b border-[var(--border-default)] section-header">
                  Switch project
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {projects.length === 0 ? (
                    <div className="p-4 text-sm text-[var(--text-muted)]">No projects yet.</div>
                  ) : (
                    projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          switchProject(p.id);
                          setProjectOpen(false);
                        }}
                        className="w-full text-left p-3 hover:bg-[var(--bg-surface-hover)] flex items-center gap-2.5 border-b border-[var(--border-default)] last:border-b-0"
                      >
                        <ProjectPoster id={p.id} name={p.name} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-[var(--text-primary)] truncate">
                            {p.name}
                          </span>
                          <span className="block text-[10px] text-[var(--text-muted)] tabular-nums">
                            {p.sceneCount} scenes · {p.elementCount} elements
                          </span>
                        </span>
                        {p.id === project?.id && (
                          <Check size={14} className="text-[var(--accent-blue)] shrink-0" />
                        )}
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
                      nav("/projects");
                      setProjectOpen(false);
                    }}
                  >
                    <Plus size={14} /> New project · manage
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2" data-tour="workspace-status">
        <PresenceAvatars />
        <AIStatusPill />
        <CloudIndicator />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button variant="ghost" size="sm" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications">
            <div className="relative">
              <motion.span
                key={bellWiggle}
                className="inline-block"
                animate={bellWiggle > 0 ? { rotate: [0, -14, 11, -7, 4, 0] } : undefined}
                transition={{ duration: 0.55, ease: "easeInOut" }}
                style={{ transformOrigin: "50% 15%" }}
              >
                <Bell size={16} />
              </motion.span>
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span
                    key={unread}
                    className="absolute -top-2 -right-2 text-[9px] font-semibold leading-none px-1 py-0.5 rounded-full min-w-[14px] text-center tabular-nums"
                    style={{ background: "var(--color-danger)", color: "white" }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  >
                    {unread > 99 ? "99+" : unread}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </Button>
          <AnimatePresence>
          {notifOpen && (
            <motion.div
              className="absolute right-0 top-full mt-2 w-80 rounded-card border border-[var(--border-default)] z-50 origin-top-right"
              style={{ background: "var(--bg-elevated)" }}
              variants={menuVariants}
              initial="initial"
              animate="animate"
              exit="exit"
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
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <Button variant="secondary" size="sm" onClick={() => setUserOpen((v) => !v)}>
            {user ? (
              <IdentityAvatar id={user.id} name={user.displayName} size={20} />
            ) : (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
              >
                {initials}
              </span>
            )}
            <span className="max-w-[120px] truncate">{user?.displayName}</span>
            <ChevronDown size={14} />
          </Button>
          <AnimatePresence>
          {userOpen && (
            <motion.div
              className="absolute right-0 top-full mt-2 w-56 rounded-card border border-[var(--border-default)] z-50 overflow-hidden origin-top-right"
              style={{ background: "var(--bg-elevated)" }}
              variants={menuVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="p-3 border-b border-[var(--border-default)]">
                <div className="text-sm font-medium text-[var(--text-primary)]">{user?.displayName}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{role?.label}</div>
              </div>
              <button
                onClick={() => {
                  nav("/settings");
                  setUserOpen(false);
                }}
                className="w-full flex items-center gap-2 p-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              >
                <SettingsIcon size={14} /> Settings
              </button>
              <button
                onClick={() => {
                  nav("/tutorial");
                  setUserOpen(false);
                }}
                className="w-full flex items-center gap-2 p-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] border-b border-[var(--border-default)]"
              >
                <BookOpen size={14} /> Help &amp; tutorial
              </button>
              <button
                onClick={() => {
                  logout();
                  nav("/login", { replace: true });
                }}
                className="w-full flex items-center gap-2 p-3 text-sm text-[var(--text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--bg-surface-hover)]"
              >
                <LogOut size={14} /> Sign out
              </button>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

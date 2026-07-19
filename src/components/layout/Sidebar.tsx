import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Home,
  FolderKanban,
  Film,
  Calendar,
  MapPin,
  ListChecks,
  DollarSign,
  Sparkles,
  Radio,
  Camera,
  Plane,
  Palette,
  Users,
  Clock,
  FileBarChart,
  Bell,
  Shield,
  Clapperboard,
  GraduationCap,
  Settings as SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useStore, unreadCount, currentRole, isCurrentAdmin, activeProject } from "@/state/store";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  access?: string; // undefined = always visible
  admin?: boolean;
  badge?: boolean;
}

interface NavSection {
  /** Undefined for the bottom-pinned group, which carries no header. */
  label?: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Project",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <Home size={18} /> },
      { to: "/projects", label: "Projects", icon: <FolderKanban size={18} /> },
      { to: "/breakdown", label: "Script Breakdown", icon: <Film size={18} />, access: "breakdown" },
      { to: "/schedule", label: "Schedule", icon: <Calendar size={18} />, access: "schedule" },
    ],
  },
  {
    label: "Departments",
    items: [
      { to: "/locations", label: "Locations", icon: <MapPin size={18} />, access: "locations" },
      { to: "/cast", label: "Cast", icon: <Users size={18} />, access: "cast" },
      { to: "/art", label: "Art / Wardrobe", icon: <Palette size={18} />, access: "art" },
      { to: "/camera", label: "Camera", icon: <Camera size={18} />, access: "camera" },
      { to: "/drones", label: "Drones", icon: <Plane size={18} />, access: "drones" },
      { to: "/vfx", label: "VFX Pipeline", icon: <Sparkles size={18} />, access: "vfx" },
      { to: "/rf", label: "RF / Comms", icon: <Radio size={18} />, access: "rf" },
    ],
  },
  {
    label: "Production",
    items: [
      { to: "/tasks", label: "Tasks", icon: <ListChecks size={18} />, access: "tasks" },
      { to: "/budget", label: "Budget", icon: <DollarSign size={18} />, access: "budget" },
      { to: "/timesheet", label: "Timesheet", icon: <Clock size={18} />, access: "timesheet" },
      { to: "/reports", label: "Reports", icon: <FileBarChart size={18} />, access: "reports" },
    ],
  },
];

const BOTTOM: NavSection = {
  // Cloud sync and AI settings now live as tabs inside the Admin console, so the
  // crew's rail stays short — admin lands one place.
  items: [
    { to: "/notifications", label: "Notifications", icon: <Bell size={18} />, badge: true },
    { to: "/tutorial", label: "Help", icon: <GraduationCap size={18} /> },
    { to: "/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
    { to: "/admin", label: "Admin", icon: <Shield size={18} />, admin: true },
  ],
};

/**
 * The nav a role actually sees. Unchanged rules — "all" or a listed access key
 * opens a page, `admin` items need an admin role — with one addition: a section
 * that filters down to nothing takes its header with it.
 */
export function visibleNav(role: Role | undefined, admin: boolean) {
  const can = (key: string) =>
    !!role && (role.access.includes("all") || role.access.includes(key));

  const visible = (i: NavItem) => {
    if (i.admin) return admin;
    if (i.access) return can(i.access);
    return true;
  };

  return {
    sections: SECTIONS.map((s) => ({ ...s, items: s.items.filter(visible) })).filter(
      (s) => s.items.length > 0
    ),
    bottom: BOTTOM.items.filter(visible),
  };
}

interface SidebarProps {
  /** Below `lg` the sidebar slides in over the content instead of pushing it. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const [hovered, setHovered] = useState(false);
  const desktop = useIsDesktop();
  const role = useStore(currentRole);
  const admin = useStore(isCurrentAdmin);
  const project = useStore(activeProject);
  const unread = useStore(unreadCount);
  const pinned = useStore((s) => s.sidebarPinned);
  const setPinned = useStore((s) => s.setSidebarPinned);

  // As an overlay there is no collapsed state to be in — it opens at full width.
  const expanded = desktop ? pinned || hovered : true;
  const width = desktop ? (expanded ? 240 : 64) : 260;

  const { sections, bottom } = visibleNav(role, admin);

  return (
    <>
      {/* Scrim — only exists while the overlay is open */}
      {!desktop && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-in"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        data-tour="sidebar"
        onMouseEnter={() => desktop && setHovered(true)}
        onMouseLeave={() => desktop && setHovered(false)}
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 transition-[width,transform] duration-200 border-r border-[var(--border-default)] overflow-hidden flex flex-col",
          !desktop && !mobileOpen && "-translate-x-full"
        )}
        style={{ width, background: "var(--sidebar-bg)" }}
      >
        {/* Brand */}
        <div className="h-16 flex items-center px-4 border-b border-[var(--border-default)] shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #4F7BF7 0%, #8B5CF6 100%)" }}
          >
            <Clapperboard size={16} className="text-white" />
          </div>
          {expanded && (
            <div className="ml-3 min-w-0">
              <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                SceneTrackable
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider truncate">
                {project ? project.name : "No project"}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="py-3 flex flex-col gap-0.5 overflow-y-auto flex-1">
          {sections.map((section, i) => (
            <React.Fragment key={section.label}>
              {expanded ? (
                <div className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {section.label}
                </div>
              ) : (
                // Collapsed, a label would be an unreadable stub — the grouping
                // survives as a rule between the icon runs.
                i > 0 && <div className="mx-3 my-2 border-t border-[var(--border-default)]" />
              )}
              {section.items.map((item) => (
                <Item
                  key={item.to}
                  item={item}
                  expanded={expanded}
                  unread={unread}
                  onNavigate={onCloseMobile}
                />
              ))}
            </React.Fragment>
          ))}
        </nav>

        {/* Bottom-pinned group */}
        {bottom.length > 0 && (
          <div className="py-2 border-t border-[var(--border-default)] shrink-0 flex flex-col gap-0.5">
            {bottom.map((item) => (
              <Item
                key={item.to}
                item={item}
                expanded={expanded}
                unread={unread}
                onNavigate={onCloseMobile}
              />
            ))}
          </div>
        )}

        {/* Pin toggle — hover-expand is the fallback, not the only way in */}
        {desktop && (
          <div className="p-2 border-t border-[var(--border-default)] shrink-0">
            <button
              onClick={() => setPinned(!pinned)}
              aria-pressed={pinned}
              title={pinned ? "Unpin sidebar" : "Keep sidebar open"}
              className={cn(
                "flex items-center gap-3 h-8 px-3 rounded-lg w-full text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors",
                !expanded && "justify-center px-0"
              )}
            >
              {pinned ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
              {expanded && <span>{pinned ? "Unpin sidebar" : "Keep open"}</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function Item({
  item,
  expanded,
  unread,
  onNavigate,
}: {
  item: NavItem;
  expanded: boolean;
  unread: number;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "relative flex items-center h-10 mx-2 rounded-lg px-3 gap-3 text-sm transition-colors group",
          isActive
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute inset-0 rounded-lg"
              style={{ background: "var(--active-tint)", boxShadow: "inset 3px 0 0 0 var(--accent-blue)" }}
              transition={{ type: "spring", stiffness: 550, damping: 40 }}
            />
          )}
          <span className="relative shrink-0 flex items-center justify-center w-5">{item.icon}</span>
          {expanded && <span className="relative truncate flex-1">{item.label}</span>}
          {expanded && item.badge && unread > 0 && (
            <span
              className="relative ml-auto text-[10px] font-semibold px-1.5 rounded-full min-w-[18px] text-center"
              style={{ background: "var(--color-danger)", color: "white" }}
            >
              {unread}
            </span>
          )}
          {!expanded && item.badge && unread > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full z-10"
              style={{ background: "var(--color-danger)" }}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

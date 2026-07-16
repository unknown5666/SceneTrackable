import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
  Palette,
  Users,
  Clock,
  FileBarChart,
  Bell,
  Sparkle,
  Shield,
  Cloud,
  Clapperboard,
  GraduationCap,
  History,
  LogOut,
} from "lucide-react";
import { useStore, unreadCount, currentUser, currentRole, isCurrentAdmin, activeProject } from "@/state/store";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  access?: string; // undefined = always visible
  admin?: boolean;
  badge?: boolean;
}

const ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <Home size={18} /> },
  { to: "/projects", label: "Projects", icon: <FolderKanban size={18} /> },
  { to: "/breakdown", label: "Script Breakdown", icon: <Film size={18} />, access: "breakdown" },
  { to: "/schedule", label: "Schedule", icon: <Calendar size={18} />, access: "schedule" },
  { to: "/locations", label: "Locations", icon: <MapPin size={18} />, access: "locations" },
  { to: "/tasks", label: "Tasks", icon: <ListChecks size={18} />, access: "tasks" },
  { to: "/budget", label: "Budget", icon: <DollarSign size={18} />, access: "budget" },
  { to: "/vfx", label: "VFX Pipeline", icon: <Sparkles size={18} />, access: "vfx" },
  { to: "/rf", label: "RF / Comms", icon: <Radio size={18} />, access: "rf" },
  { to: "/camera", label: "Camera", icon: <Camera size={18} />, access: "camera" },
  { to: "/art", label: "Art / Wardrobe", icon: <Palette size={18} />, access: "art" },
  { to: "/cast", label: "Cast", icon: <Users size={18} />, access: "cast" },
  { to: "/timesheet", label: "Timesheet", icon: <Clock size={18} />, access: "timesheet" },
  { to: "/reports", label: "Reports", icon: <FileBarChart size={18} />, access: "reports" },
  { to: "/notifications", label: "Notifications", icon: <Bell size={18} />, badge: true },
  { to: "/tutorial", label: "Tutorial", icon: <GraduationCap size={18} /> },
  { to: "/ai", label: "AI Settings", icon: <Sparkle size={18} />, admin: true },
  { to: "/cloud", label: "Cloud Sync", icon: <Cloud size={18} /> },
  { to: "/activity", label: "Activity Log", icon: <History size={18} />, admin: true },
  { to: "/admin", label: "Admin", icon: <Shield size={18} />, admin: true },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const nav = useNavigate();
  const user = useStore(currentUser);
  const role = useStore(currentRole);
  const admin = useStore(isCurrentAdmin);
  const project = useStore(activeProject);
  const unread = useStore(unreadCount);
  const logout = useStore((s) => s.logout);

  const can = (key: string) =>
    !!role && (role.access.includes("all") || role.access.includes(key));

  const items = ITEMS.filter((i) => {
    if (i.admin) return admin;
    if (i.access) return can(i.access);
    return true;
  });

  const width = expanded ? 240 : 64;
  const initials = (user?.displayName || "U").split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="fixed left-0 top-0 bottom-0 z-40 transition-[width] duration-200 border-r border-[var(--border-default)] overflow-hidden flex flex-col"
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

      {/* Identity */}
      <div className="px-3 py-3 border-b border-[var(--border-default)] shrink-0">
        <div className={cn("flex items-center gap-3", !expanded && "justify-center")}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          >
            {initials}
          </div>
          {expanded && (
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                {user?.displayName}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">{role?.label}</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="py-3 flex flex-col gap-0.5 overflow-y-auto flex-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "relative flex items-center h-10 mx-2 rounded-lg px-3 gap-3 text-sm transition-colors group",
                isActive
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              )
            }
            style={({ isActive }) =>
              isActive
                ? { background: "var(--active-tint)", boxShadow: "inset 3px 0 0 0 var(--accent-blue)" }
                : undefined
            }
          >
            <span className="shrink-0 flex items-center justify-center w-5">{item.icon}</span>
            {expanded && <span className="truncate flex-1">{item.label}</span>}
            {expanded && item.badge && unread > 0 && (
              <span
                className="ml-auto text-[10px] font-semibold px-1.5 rounded-full min-w-[18px] text-center"
                style={{ background: "var(--color-danger)", color: "white" }}
              >
                {unread}
              </span>
            )}
            {!expanded && item.badge && unread > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: "var(--color-danger)" }}
              />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[var(--border-default)] shrink-0">
        <button
          onClick={() => {
            logout();
            nav("/login", { replace: true });
          }}
          className={cn(
            "flex items-center gap-3 text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors w-full",
            !expanded && "justify-center"
          )}
        >
          <LogOut size={16} />
          {expanded && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

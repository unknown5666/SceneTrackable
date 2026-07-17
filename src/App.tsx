import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "@/pages/Login";
import { MainLayout } from "@/components/layout/MainLayout";
import { Dashboard } from "@/pages/Dashboard";
import { Projects } from "@/pages/Projects";
import { Breakdown } from "@/pages/Breakdown";
import { Schedule } from "@/pages/Schedule";
import { Locations } from "@/pages/Locations";
import { Tasks } from "@/pages/Tasks";
import { Budget } from "@/pages/Budget";
import { Reports } from "@/pages/Reports";
import { VFXPipeline } from "@/pages/VFXPipeline";
import { RFComms } from "@/pages/RFComms";
import { CameraPortal } from "@/pages/CameraPortal";
import { ArtPortal } from "@/pages/ArtPortal";
import { CastPortal } from "@/pages/CastPortal";
import { Timesheet } from "@/pages/Timesheet";
import { Notifications } from "@/pages/Notifications";
import { AISettings } from "@/pages/AISettings";
import { CloudSync } from "@/pages/CloudSync";
import { Admin } from "@/pages/Admin";
import { ActivityLog } from "@/pages/ActivityLog";
import { Tutorial } from "@/pages/Tutorial";
import { useStore, permissionLevel, isCurrentAdmin } from "@/state/store";
import { Eye } from "lucide-react";

/**
 * Routes a page by the current role's level on it: "none" bounces to the
 * dashboard, "read" renders it under a banner (the pages themselves drop
 * their write controls), "write" renders it as-is.
 */
function AccessGuard({ page, children }: { page: string; children: React.ReactNode }) {
  const level = useStore((s) => permissionLevel(s, page));
  if (level === "none") return <Navigate to="/dashboard" replace />;
  if (level === "read")
    return (
      <>
        <div className="max-w-[1400px] mx-auto mb-4 flex items-center gap-2 rounded border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <Eye size={13} className="text-[var(--text-muted)] shrink-0" />
          <span>
            Read-only — your role can view this page but not change it. Ask an
            administrator if you need edit access.
          </span>
        </div>
        {children}
      </>
    );
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const admin = useStore(isCurrentAdmin);
  return admin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<MainLayout />}>
        <Route path="/projects" element={<Projects />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/breakdown" element={<AccessGuard page="breakdown"><Breakdown /></AccessGuard>} />
        <Route path="/schedule" element={<AccessGuard page="schedule"><Schedule /></AccessGuard>} />
        <Route path="/locations" element={<AccessGuard page="locations"><Locations /></AccessGuard>} />
        <Route path="/tasks" element={<AccessGuard page="tasks"><Tasks /></AccessGuard>} />
        <Route path="/budget" element={<AccessGuard page="budget"><Budget /></AccessGuard>} />
        <Route path="/reports" element={<AccessGuard page="reports"><Reports /></AccessGuard>} />
        <Route path="/vfx" element={<AccessGuard page="vfx"><VFXPipeline /></AccessGuard>} />
        <Route path="/rf" element={<AccessGuard page="rf"><RFComms /></AccessGuard>} />
        <Route path="/camera" element={<AccessGuard page="camera"><CameraPortal /></AccessGuard>} />
        <Route path="/art" element={<AccessGuard page="art"><ArtPortal /></AccessGuard>} />
        <Route path="/cast" element={<AccessGuard page="cast"><CastPortal /></AccessGuard>} />
        <Route path="/timesheet" element={<AccessGuard page="timesheet"><Timesheet /></AccessGuard>} />
        <Route path="/ai" element={<AdminGuard><AISettings /></AdminGuard>} />
        {/* Sync affects everyone's data, so everyone can see its state and
            resolve their own conflicts — it is no longer an admin console. */}
        <Route path="/cloud" element={<CloudSync />} />
        <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
        <Route path="/activity" element={<AdminGuard><ActivityLog /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}

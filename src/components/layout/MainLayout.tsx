import React, { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { CloudConflictBanner, useUnsavedCloudGuard } from "./CloudIndicator";
import { useStore } from "@/state/store";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { resumeCloud } from "@/lib/cloud";

export function MainLayout() {
  const userId = useStore((s) => s.currentUserId);
  const pinned = useStore((s) => s.sidebarPinned);
  const desktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Growing past `lg` turns the overlay back into the rail; leaving it open
  // would strand the scrim over content the sidebar no longer covers.
  useEffect(() => {
    if (desktop) setMobileOpen(false);
  }, [desktop]);

  // A reload drops the in-memory sync loop but not the Supabase session, so
  // a returning user reconnects here rather than being asked to sign in again.
  useEffect(() => {
    if (userId) void resumeCloud();
  }, [userId]);

  useUnsavedCloudGuard();

  if (!userId) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div
        style={{ marginLeft: desktop ? (pinned ? 240 : 64) : 0 }}
        className="min-h-screen flex flex-col transition-[margin] duration-200"
      >
        <TopBar onOpenSidebar={() => setMobileOpen(true)} />
        <CloudConflictBanner />
        <main className="flex-1 p-6 animate-in">
          <Outlet />
        </main>
        <Footer className="pb-4 pt-2" />
      </div>
    </div>
  );
}

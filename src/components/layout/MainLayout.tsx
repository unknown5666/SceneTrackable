import React, { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { CloudConflictBanner, useUnsavedCloudGuard } from "./CloudIndicator";
import { useStore } from "@/state/store";
import { resumeCloud } from "@/lib/cloud";

export function MainLayout() {
  const userId = useStore((s) => s.currentUserId);

  // A reload drops the in-memory sync loop but not the Supabase session, so
  // a returning user reconnects here rather than being asked to sign in again.
  useEffect(() => {
    if (userId) void resumeCloud();
  }, [userId]);

  useUnsavedCloudGuard();

  if (!userId) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar />
      <div style={{ marginLeft: 64 }} className="min-h-screen flex flex-col">
        <TopBar />
        <CloudConflictBanner />
        <main className="flex-1 p-6 animate-in">
          <Outlet />
        </main>
        <Footer className="pb-4 pt-2" />
      </div>
    </div>
  );
}

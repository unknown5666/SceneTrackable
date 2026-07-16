import React from "react";
import { Outlet, Navigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { useStore } from "@/state/store";

export function MainLayout() {
  const userId = useStore((s) => s.currentUserId);
  if (!userId) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar />
      <div style={{ marginLeft: 64 }} className="min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1 p-6 animate-in">
          <Outlet />
        </main>
        <Footer className="pb-4 pt-2" />
      </div>
    </div>
  );
}

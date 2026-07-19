import React, { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { CloudConflictBanner, useUnsavedCloudGuard } from "./CloudIndicator";
import { CommandPalette } from "@/components/CommandPalette";
import { TourOverlay } from "@/components/TourOverlay";
import { Toaster } from "@/components/ui/Toaster";
import { useStore } from "@/state/store";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { resumeCloud } from "@/lib/cloud";
import { setNavigator } from "@/lib/nav";

export function MainLayout() {
  const userId = useStore((s) => s.currentUserId);
  const pinned = useStore((s) => s.sidebarPinned);
  const desktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();

  // Bridge react-router navigation to non-component callers (store/toasts) —
  // e.g. the "Review" action on the background-breakdown completion toast.
  useEffect(() => {
    setNavigator(navigate);
    return () => setNavigator(null);
  }, [navigate]);

  // Background auto-retry: when a breakdown parked on a provider limit and the
  // user left auto-retry armed, fire the retry once the cooldown elapses —
  // regardless of which page they're on or whether the dialog is open.
  const cooldownUntil = useStore((s) => s.breakdownRun?.cooldownUntil);
  const autoRetryArmed = useStore((s) => s.breakdownRun?.autoRetry);
  useEffect(() => {
    if (!cooldownUntil || !autoRetryArmed) return;
    const iv = setInterval(() => {
      const r = useStore.getState().breakdownRun;
      if (r?.cooldownUntil && r.autoRetry && !r.retrying && Date.now() >= r.cooldownUntil) {
        void useStore.getState().retryBreakdownScenes();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [cooldownUntil, autoRetryArmed]);
  const reduce = useReducedMotion();
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

  // The guided tour loads the sample production first, which reloads the page.
  // This resumes the tour once the fresh workspace is up.
  useEffect(() => {
    if (userId && localStorage.getItem("st-resume-tour")) {
      localStorage.removeItem("st-resume-tour");
      useStore.getState().startTour();
    }
  }, [userId]);

  useUnsavedCloudGuard();

  if (!userId) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div
        style={{ marginLeft: desktop ? (pinned ? 240 : 64) : 0 }}
        className="min-h-screen flex flex-col transition-[margin] duration-200"
      >
        <TopBar onOpenSidebar={() => setMobileOpen(true)} />
        <CloudConflictBanner />
        <main className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.13 } }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer className="pb-4 pt-2" />
      </div>
      <CommandPalette />
      <TourOverlay />
      <Toaster />
    </div>
  );
}

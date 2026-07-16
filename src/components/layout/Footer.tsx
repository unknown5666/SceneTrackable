import React from "react";

/** Small persistent attribution shown across the app. */
export function Footer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`text-center text-[10px] tracking-wide text-[var(--text-muted)] select-none ${className}`}
    >
      Built by <span className="text-[var(--text-secondary)]">OverExposure Productions</span>
    </div>
  );
}

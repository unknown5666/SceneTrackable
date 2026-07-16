import React from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-6 border-b border-[var(--border-default)]",
        className
      )}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative py-3 text-sm font-medium transition-colors flex items-center gap-2",
              isActive
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t.label}
            {t.badge}
            {isActive && (
              <span
                className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                style={{ background: "var(--accent-blue)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

import React, { useState } from "react";
import { Settings as SettingsIcon, Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme, type ThemePref } from "@/state/theme";
import { Card } from "@/components/ui/Card";
import { HelpButton } from "@/components/ui/HelpButton";
import {
  ACCENTS,
  readAppearance,
  saveAppearance,
  type Density,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * Per-user preferences — distinct from the Admin console. Everything here is
 * personal and local: theme, accent and density. Theme changes ride the
 * View Transitions circular reveal (see state/theme.tsx).
 */
export function Settings() {
  const { pref, setPref } = useTheme();
  const [appearance, setAppearance] = useState(readAppearance);

  const update = (patch: Partial<typeof appearance>) => {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
  };

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header flex items-center gap-1.5">
            Preferences <HelpButton doc="settings" />
          </div>
          <div className="page-title">Settings</div>
        </div>
      </div>

      <Card padding="lg" className="mb-5">
        <div className="section-header mb-1">Appearance</div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          These apply to your device only.
        </p>

        {/* Theme preview cards */}
        <div className="mb-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Theme</div>
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            {(["light", "dark", "system"] as ThemePref[]).map((opt) => (
              <ThemeCard
                key={opt}
                option={opt}
                active={pref === opt}
                onSelect={(e) => setPref(opt, { x: e.clientX, y: e.clientY })}
              />
            ))}
          </div>
        </div>

        {/* Accent color */}
        <div className="mb-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Accent color</div>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => {
              const active = appearance.accent.toLowerCase() === a.value.toLowerCase();
              return (
                <button
                  key={a.value}
                  onClick={() => update({ accent: a.value })}
                  title={a.name}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{
                    background: a.value,
                    boxShadow: active ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${a.value}` : "none",
                  }}
                  aria-label={a.name}
                >
                  {active && <Check size={16} className="text-white" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Density */}
        <div>
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Density</div>
          <div className="inline-flex rounded-lg border border-[var(--border-default)] p-0.5">
            {(["comfortable", "compact"] as Density[]).map((d) => (
              <button
                key={d}
                onClick={() => update({ density: d })}
                className={cn(
                  "px-3.5 h-8 rounded-md text-xs font-medium capitalize transition-colors",
                  appearance.density === d
                    ? "bg-[var(--active-tint)] text-[var(--accent-blue)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ThemeCard({
  option,
  active,
  onSelect,
}: {
  option: ThemePref;
  active: boolean;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const meta = {
    light: { label: "Light", icon: <Sun size={13} /> },
    dark: { label: "Dark", icon: <Moon size={13} /> },
    system: { label: "System", icon: <Monitor size={13} /> },
  }[option];

  return (
    <button
      onClick={onSelect}
      className={cn(
        "rounded-card border overflow-hidden text-left transition-all",
        active
          ? "border-[var(--accent-blue)] ring-2 ring-[var(--accent-blue)] ring-offset-2 ring-offset-[var(--bg-surface)]"
          : "border-[var(--border-default)] hover:border-[var(--border-hover)]"
      )}
    >
      {/* Mini UI preview */}
      <div
        className="h-20 p-2 flex gap-1.5"
        style={{
          background:
            option === "light"
              ? "#F5F5F7"
              : option === "dark"
                ? "#0A0A0F"
                : "linear-gradient(120deg, #0A0A0F 0 50%, #F5F5F7 50% 100%)",
        }}
      >
        <div
          className="w-1/3 rounded"
          style={{ background: option === "light" ? "#EBEBF0" : option === "dark" ? "#08080D" : "linear-gradient(120deg,#08080D 0 50%,#EBEBF0 50%)" }}
        />
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-2 rounded" style={{ background: "var(--accent-blue)", width: "60%" }} />
          <div className="h-1.5 rounded" style={{ background: option === "light" ? "#D6D6DE" : option === "dark" ? "#1E1E2A" : "#888" , width: "80%" }} />
          <div className="h-1.5 rounded" style={{ background: option === "light" ? "#D6D6DE" : option === "dark" ? "#1E1E2A" : "#888", width: "50%" }} />
        </div>
      </div>
      <div className="flex items-center justify-between px-2.5 py-2 bg-[var(--bg-surface)]">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          {meta.icon} {meta.label}
        </span>
        {active && <Check size={13} className="text-[var(--accent-blue)]" />}
      </div>
    </button>
  );
}

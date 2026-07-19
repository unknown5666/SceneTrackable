import React from "react";
import { Clapperboard } from "lucide-react";
import { gradientFor, initialsOf } from "@/lib/identity";
import { cn } from "@/lib/utils";

interface ProjectPosterProps {
  id: string;
  name: string;
  /** Square side in px. */
  size?: number;
  rounded?: string;
  className?: string;
  /** Show a small clapperboard glyph behind the initials. */
  glyph?: boolean;
}

/**
 * Auto-generated gradient "poster" for a project — a deterministic 2-hue
 * gradient from the project id with its initials. Shown in the project switcher
 * and on Projects cards so productions are visually distinct at a glance.
 */
export function ProjectPoster({
  id,
  name,
  size = 36,
  rounded = "rounded-lg",
  className,
  glyph,
}: ProjectPosterProps) {
  const g = gradientFor(id);
  return (
    <span
      className={cn("relative inline-flex items-center justify-center overflow-hidden shrink-0 text-white", rounded, className)}
      style={{ width: size, height: size, background: g.css }}
      aria-hidden
    >
      {glyph && (
        <Clapperboard
          size={size * 0.9}
          className="absolute -right-1 -bottom-1 text-white/20"
        />
      )}
      <span className="relative font-semibold" style={{ fontSize: Math.round(size * 0.36) }}>
        {initialsOf(name)}
      </span>
    </span>
  );
}

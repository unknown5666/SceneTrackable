import React from "react";
import type { Scene } from "@/types";
import { intExtChip, timeChip } from "@/lib/breakdownVisuals";
import { cn } from "@/lib/utils";

/**
 * A screenplay slugline in monospace with the fixed INT/EXT + day/night color
 * coding, so `INT. WAREHOUSE - NIGHT` reads the same in Breakdown, Schedule,
 * DOOD and Reports.
 */
export function SceneHeading({
  scene,
  showNumber,
  className,
}: {
  scene: Pick<Scene, "number" | "intExt" | "location" | "timeOfDay">;
  showNumber?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs min-w-0", className)}>
      {showNumber && (
        <span className="text-[var(--text-muted)] shrink-0">{scene.number}</span>
      )}
      <span
        className="px-1.5 py-0.5 rounded font-semibold shrink-0"
        style={intExtChip(scene.intExt)}
      >
        {scene.intExt}
      </span>
      <span className="text-[var(--text-primary)] uppercase tracking-tight truncate">
        {scene.location}
      </span>
      <span
        className="px-1.5 py-0.5 rounded font-semibold shrink-0"
        style={timeChip(scene.timeOfDay)}
      >
        {scene.timeOfDay}
      </span>
    </span>
  );
}

/** Just the INT/EXT chip. */
export function IntExtBadge({ intExt }: { intExt: Scene["intExt"] }) {
  return (
    <span className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold" style={intExtChip(intExt)}>
      {intExt}
    </span>
  );
}

/** Just the time-of-day chip. */
export function TimeBadge({ time }: { time: Scene["timeOfDay"] }) {
  return (
    <span className="px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold" style={timeChip(time)}>
      {time}
    </span>
  );
}

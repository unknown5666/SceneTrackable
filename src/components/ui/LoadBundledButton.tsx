import React, { useState } from "react";
import { Clapperboard } from "lucide-react";
import { Button } from "./Button";
import { loadBundledProduction, BUNDLED_PRODUCTIONS } from "@/lib/export";

/**
 * One-click loader for a production that ships with the app.
 *
 * Unlike `LoadSampleButton`, which restores the starter workspace wholesale,
 * this merges — so it can sit on a workspace that already has projects in it
 * without costing the user any of them. Success reloads the page, so the
 * spinner only has to survive until navigation; a failure shows the reason
 * inline and re-enables the button.
 */
export function LoadBundledButton({
  id,
  variant = "secondary",
  size = "md",
  label,
  className,
}: {
  id: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  label?: string;
  className?: string;
}) {
  const entry = BUNDLED_PRODUCTIONS.find((p) => p.id === id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    const err = await loadBundledProduction(id);
    if (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button variant={variant} size={size} className={className} onClick={run} loading={loading}>
        {!loading && <Clapperboard size={14} />}
        {/* The name is Arabic; `dir="auto"` keeps it laid out right inside an
            otherwise left-to-right button. */}
        <span dir="auto">{loading ? "Loading…" : (label ?? `Open ${entry.name}`)}</span>
      </Button>
      {error && (
        <span className="text-xs text-[var(--color-danger)] text-center max-w-xs">{error}</span>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { Clapperboard } from "lucide-react";
import { Button } from "./Button";
import { loadSampleProduction } from "@/lib/export";

interface LoadSampleButtonProps {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  label?: string;
}

/**
 * One-click loader for the bundled showcase production. It restores through the
 * same path as a backup and reloads, so the page never re-renders past the
 * click — the spinner just needs to survive until navigation. On failure it
 * shows the reason inline and re-enables.
 */
export function LoadSampleButton({
  variant = "secondary",
  size = "md",
  className,
  label = "Load sample production",
}: LoadSampleButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    const err = await loadSampleProduction();
    if (err) {
      setError(err);
      setLoading(false);
    }
    // Success reloads the page — no need to reset state.
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button variant={variant} size={size} className={className} onClick={run} loading={loading}>
        {!loading && <Clapperboard size={14} />}
        {loading ? "Loading demo…" : label}
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)] text-center max-w-xs">{error}</span>}
    </div>
  );
}

import React from "react";
import { Users, Phone, Star } from "lucide-react";
import { useStore } from "@/state/store";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";

export function CastPortal() {
  const cast = useStore((s) => s.cast);
  const scenes = useStore((s) => s.scenes);
  const production = useStore((s) => s.production);

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-6">
        <div className="section-header">Cast</div>
        <div className="page-title mt-1">Cast Directory</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cast.map((c) => {
          const sceneCount = c.scenes.length;
          return (
            <Card key={c.id}>
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{
                    background:
                      c.category === "lead"
                        ? "var(--accent-blue)"
                        : c.category === "supporting"
                        ? "var(--color-ai)"
                        : "var(--bg-elevated)",
                    color: c.category === "day_player" ? "var(--text-primary)" : "white",
                    border: c.category === "day_player" ? "1px solid var(--border-default)" : "none",
                  }}
                >
                  {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{c.name}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    as <span className="font-medium">{c.role}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge
                      tone={
                        c.category === "lead"
                          ? "info"
                          : c.category === "supporting"
                          ? "ai"
                          : "muted"
                      }
                    >
                      {c.category.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {sceneCount} scenes
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-2">
                    {formatCurrency(c.ratePerDay, production.currency)}/day
                    {c.agent && ` · ${c.agent}`}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { equipmentPresetById, type SilhouetteKey } from "@/data/equipment-presets";

// ============================================================
// EQUIPMENT IMAGE — never a broken <img>
// ============================================================
// Resolution order: a record's own imageUrl (a real photo) → the preset's
// inline silhouette with a manufacturer initial badge → a generic silhouette.
// The silhouettes are drawn inline so nothing is a bundled binary and the store
// only ever holds a presetId.

/** The inline silhouette shapes, currentColor-filled so they theme cleanly. */
function Silhouette({ kind }: { kind: SilhouetteKey }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  switch (kind) {
    case "cinema_camera":
      return (
        <>
          <rect x="18" y="34" width="44" height="34" rx="4" {...common} />
          <circle cx="34" cy="28" r="9" {...common} />
          <circle cx="52" cy="28" r="9" {...common} />
          <rect x="62" y="42" width="20" height="18" rx="3" {...common} />
          <circle cx="86" cy="51" r="5" {...common} />
        </>
      );
    case "box_camera":
      return (
        <>
          <rect x="24" y="34" width="40" height="32" rx="4" {...common} />
          <rect x="64" y="42" width="16" height="16" rx="2" {...common} />
          <circle cx="86" cy="50" r="5" {...common} />
          <rect x="34" y="24" width="18" height="10" rx="2" {...common} />
        </>
      );
    case "mirrorless":
      return (
        <>
          <rect x="24" y="38" width="40" height="28" rx="5" {...common} />
          <circle cx="44" cy="52" r="11" {...common} />
          <rect x="36" y="30" width="12" height="8" rx="2" {...common} />
          <rect x="64" y="44" width="16" height="16" rx="8" {...common} />
        </>
      );
    case "lens":
      return (
        <>
          <rect x="28" y="34" width="52" height="32" rx="6" {...common} />
          <line x1="40" y1="34" x2="40" y2="66" {...common} />
          <line x1="54" y1="34" x2="54" y2="66" {...common} />
          <circle cx="80" cy="50" r="4" {...common} />
        </>
      );
    case "support":
      return (
        <>
          <rect x="40" y="24" width="24" height="12" rx="2" {...common} />
          <line x1="52" y1="36" x2="52" y2="48" {...common} />
          <line x1="52" y1="48" x2="30" y2="76" {...common} />
          <line x1="52" y1="48" x2="52" y2="76" {...common} />
          <line x1="52" y1="48" x2="74" y2="76" {...common} />
        </>
      );
    case "handheld_tx":
      return (
        <>
          <rect x="40" y="30" width="24" height="44" rx="6" {...common} />
          <line x1="52" y1="20" x2="52" y2="30" {...common} />
          <circle cx="52" cy="16" r="3" {...common} />
          <circle cx="52" cy="46" r="4" {...common} />
        </>
      );
    case "bodypack":
      return (
        <>
          <rect x="36" y="30" width="30" height="46" rx="5" {...common} />
          <line x1="66" y1="38" x2="80" y2="24" {...common} />
          <line x1="42" y1="66" x2="60" y2="66" {...common} />
          <line x1="42" y1="58" x2="60" y2="58" {...common} />
        </>
      );
    case "headset":
      return (
        <>
          <path d="M28 54 a24 24 0 0 1 48 0" {...common} />
          <rect x="22" y="52" width="12" height="18" rx="4" {...common} />
          <rect x="70" y="52" width="12" height="18" rx="4" {...common} />
          <path d="M70 62 q-16 8 -22 18" {...common} />
        </>
      );
    case "video_tx":
      return (
        <>
          <rect x="30" y="40" width="34" height="26" rx="4" {...common} />
          <line x1="70" y1="24" x2="70" y2="52" {...common} />
          <line x1="64" y1="30" x2="76" y2="30" {...common} />
          <line x1="66" y1="40" x2="74" y2="40" {...common} />
        </>
      );
    case "quadcopter":
      return (
        <>
          <rect x="42" y="42" width="20" height="16" rx="3" {...common} />
          <line x1="42" y1="46" x2="24" y2="30" {...common} />
          <line x1="62" y1="46" x2="80" y2="30" {...common} />
          <line x1="42" y1="54" x2="24" y2="70" {...common} />
          <line x1="62" y1="54" x2="80" y2="70" {...common} />
          <circle cx="22" cy="28" r="8" {...common} />
          <circle cx="82" cy="28" r="8" {...common} />
          <circle cx="22" cy="72" r="8" {...common} />
          <circle cx="82" cy="72" r="8" {...common} />
        </>
      );
    default:
      return <rect x="28" y="34" width="48" height="32" rx="5" {...common} />;
  }
}

export function EquipmentImage({
  imageUrl,
  presetId,
  manufacturer,
  silhouette,
  size = 48,
  className,
}: {
  imageUrl?: string;
  presetId?: string;
  manufacturer?: string;
  silhouette?: SilhouetteKey;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const preset = equipmentPresetById(presetId);
  const kind: SilhouetteKey = silhouette ?? preset?.silhouette ?? "generic";
  const brand = (manufacturer ?? preset?.manufacturer ?? "").trim();
  const initial = brand ? brand[0].toUpperCase() : "";

  // A real photo wins whenever it loads.
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={brand || "Equipment"}
        onError={() => setBroken(true)}
        className={`object-cover rounded-lg border border-[var(--border-default)] shrink-0 ${className ?? ""}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`relative rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] flex items-center justify-center shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
      title={brand}
    >
      <svg
        viewBox="0 0 104 100"
        width={size * 0.78}
        height={size * 0.78}
        className="text-[var(--text-muted)]"
        aria-hidden
      >
        <Silhouette kind={kind} />
      </svg>
      {initial && (
        <span
          className="absolute bottom-0.5 right-0.5 flex items-center justify-center rounded-full font-semibold text-white"
          style={{
            width: Math.max(14, size * 0.32),
            height: Math.max(14, size * 0.32),
            fontSize: Math.max(8, size * 0.2),
            background: "var(--accent-blue)",
          }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

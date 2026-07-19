import React from "react";
import { gradientFor, initialsOf } from "@/lib/identity";
import { cn } from "@/lib/utils";

interface IdentityAvatarProps {
  /** Stable identity key — user/cast/crew id. */
  id: string;
  name: string;
  /** Pixel size (square). */
  size?: number;
  /** Optional headshot; falls back to the gradient + initials. */
  imageUrl?: string;
  className?: string;
  /** Ring color, e.g. presence state. */
  ring?: string;
  title?: string;
}

/**
 * Gradient identity avatar. Deterministic 2-hue gradient from the id hash with
 * initials on top, or a headshot when provided. Used across TopBar, presence,
 * tasks, activity and DOOD so a person looks the same everywhere.
 */
export function IdentityAvatar({
  id,
  name,
  size = 28,
  imageUrl,
  className,
  ring,
  title,
}: IdentityAvatarProps) {
  const g = gradientFor(id);
  const fontSize = Math.round(size * 0.38);
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 text-white font-semibold select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize,
        background: imageUrl ? undefined : g.css,
        boxShadow: ring ? `0 0 0 2px var(--bg-base), 0 0 0 3.5px ${ring}` : undefined,
      }}
      title={title ?? name}
      aria-label={name}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

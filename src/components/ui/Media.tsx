import React, { useRef, useState } from "react";
import { MapPin, ImageOff, Upload, X, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { downscaleImage } from "@/lib/image";
import { cn } from "@/lib/utils";

// ============================================================
// MEDIA — image thumbnails and an embedded map, both URL-first
// ============================================================
// These render nothing at all when empty, so a page can drop one in
// unconditionally and it simply disappears for records with no media.

/**
 * A small image that enlarges in a modal on click. Renders nothing when there
 * is no source, and quietly hides itself if the URL fails to load — a broken
 * <img> icon is never shown.
 */
export function ImageThumb({
  src,
  alt,
  size = 44,
  rounded = "rounded-lg",
  className,
  enlarge = true,
}: {
  src?: string;
  alt?: string;
  size?: number;
  rounded?: string;
  className?: string;
  /** Allow click-to-enlarge. Off for tiny inline avatars. */
  enlarge?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);

  if (!src || broken) return null;

  return (
    <>
      <img
        src={src}
        alt={alt ?? ""}
        onError={() => setBroken(true)}
        onClick={enlarge ? () => setOpen(true) : undefined}
        className={cn(
          "object-cover border border-[var(--border-default)] shrink-0",
          rounded,
          enlarge && "cursor-zoom-in",
          className
        )}
        style={{ width: size, height: size }}
      />
      {enlarge && open && (
        <Modal open={open} onClose={() => setOpen(false)} size="lg" title={alt || "Image"}>
          <div className="flex justify-center">
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              src={src}
              alt={alt ?? ""}
              onError={() => setBroken(true)}
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          </div>
        </Modal>
      )}
    </>
  );
}

/** A round initials avatar, gender-tinted when known. Used for cast rosters. */
export function InitialsAvatar({
  name,
  imageUrl,
  gender,
  size = 40,
}: {
  name: string;
  imageUrl?: string;
  gender?: "M" | "F" | "NB" | "Other";
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setBroken(true)}
        className="rounded-full object-cover border border-[var(--border-default)] shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  const tint =
    gender === "F"
      ? "#EC4899"
      : gender === "M"
      ? "#4F7BF7"
      : gender === "NB"
      ? "#8B5CF6"
      : gender === "Other"
      ? "#14B8A6"
      : "var(--text-muted)";

  return (
    <span
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: tint, fontSize: size * 0.36 }}
      title={name}
    >
      {initials}
    </span>
  );
}

/**
 * Turn whatever a user pasted — a full Maps URL, a `<iframe src="…">` embed
 * snippet, or a plain street address — into an embeddable map src. Returns null
 * when there's nothing usable, so the caller renders nothing.
 */
export function mapEmbedSrc(value: string | undefined, fallbackAddress?: string): string | null {
  const raw = (value || fallbackAddress || "").trim();
  if (!raw) return null;

  // Pasted embed snippet: pull the src out of it.
  const iframeSrc = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  if (iframeSrc) return iframeSrc[1];

  // Already an embed URL.
  if (/[?&]output=embed/.test(raw)) return raw;

  // A Maps URL → coerce to the embeddable output.
  if (/^https?:\/\/(www\.)?google\.[^/]+\/maps/i.test(raw) || /maps\.app\.goo\.gl/i.test(raw)) {
    return raw.includes("?") ? `${raw}&output=embed` : `${raw}?output=embed`;
  }

  // A plain address (or any other URL) → a query search embed.
  return `https://www.google.com/maps?q=${encodeURIComponent(raw)}&output=embed`;
}

/**
 * A lazily-loaded map iframe for a location. Accepts a Maps URL or address and
 * falls back to a plain `address`. Renders nothing when there's nothing to map.
 */
export function MapEmbed({
  value,
  address,
  height = 200,
  className,
}: {
  value?: string;
  address?: string;
  height?: number;
  className?: string;
}) {
  const src = mapEmbedSrc(value, address);
  if (!src) return null;
  return (
    <div
      className={cn("rounded-lg overflow-hidden border border-[var(--border-default)]", className)}
      style={{ height }}
    >
      <iframe
        title="Location map"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="w-full h-full border-0"
      />
    </div>
  );
}

/** A small "no image" placeholder for catalog grids that always want a tile. */
export function ImageFallback({ size = 44, label }: { size?: number; label?: string }) {
  return (
    <span
      className="rounded-lg flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-muted)] shrink-0"
      style={{ width: size, height: size }}
      title={label}
    >
      <ImageOff size={size * 0.4} />
    </span>
  );
}

/**
 * A URL-or-upload image control: paste a link, or pick a file that is
 * downscaled to a small JPEG data-URI so the store payload stays tiny. Preview
 * and clear are built in. Shared by the generic RecordEditor and the bespoke
 * cast modal so there's exactly one uploader.
 */
export function ImageInput({
  value,
  placeholder,
  onChange,
  previewSize = 56,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  previewSize?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isData = value.startsWith("data:");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      onChange(await downscaleImage(file));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="url"
          className="w-full"
          value={isData ? "" : value}
          placeholder={isData ? "Uploaded image" : placeholder ?? "https://…"}
          disabled={isData}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Upload image"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange("")}
            aria-label="Clear image"
          >
            <X size={13} />
          </Button>
        )}
      </div>
      {value && <ImageThumb src={value} size={previewSize} />}
      {err && <div className="text-[11px] text-[var(--color-danger)]">{err}</div>}
    </div>
  );
}

/** A minimal address chip that opens the location on Google Maps in a new tab. */
export function MapLink({ value, address }: { value?: string; address?: string }) {
  const raw = (value || address || "").trim();
  if (!raw) return null;
  const href = /^https?:\/\//i.test(raw)
    ? raw
    : `https://www.google.com/maps?q=${encodeURIComponent(raw)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[var(--accent-blue)] hover:underline"
    >
      <MapPin size={12} /> Map
    </a>
  );
}

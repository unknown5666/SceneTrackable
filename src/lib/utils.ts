export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const cn = classNames;

export function formatCurrency(amount: number, currency = "AED"): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `${currency} ${formatted}`;
}

export function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return `${amount}`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...opts,
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function isOverdue(deadline: string, now: Date = new Date()): boolean {
  return new Date(deadline).getTime() < now.getTime();
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function bytesToLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function id(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

// ------------------------------------------------------------
// Password hashing (Web Crypto SHA-256). Stored as "sha256$<hex>".
// Legacy plaintext passwords are upgraded on first successful login.
// ------------------------------------------------------------
export const HASH_PREFIX = "sha256$";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  return HASH_PREFIX + (await sha256Hex(password));
}

export async function verifyPassword(stored: string, input: string): Promise<boolean> {
  if (stored.startsWith(HASH_PREFIX)) {
    return stored === (await hashPassword(input));
  }
  // Legacy plaintext record.
  return stored === input;
}

// ============================================================
// CLOUD SYNC — Supabase-backed workspace sync (env-gated).
// The whole persisted store is synced as one JSON document per
// Supabase account ("workspace"). Activates only when
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
// ============================================================

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

const STORE_KEY = "scenetrackable-v1";
const TABLE = "workspaces";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app was built/served with Supabase credentials. */
export const cloudEnabled: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anonKey!)
  : null;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const { error } = await supabase.auth.signUp({ email, password });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

export interface CloudMeta {
  updatedAt: string | null;
}

/** Upload the local workspace to the cloud (overwrites the cloud copy). */
export async function pushWorkspace(): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const session = await getSession();
  if (!session) return "Sign in first.";
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return "Nothing to sync yet.";
  const { error } = await supabase.from(TABLE).upsert({
    user_id: session.user.id,
    state: JSON.parse(raw),
    updated_at: new Date().toISOString(),
  });
  return error ? error.message : null;
}

/** Download the cloud workspace into local storage and reload the app. */
export async function pullWorkspace(): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const session = await getSession();
  if (!session) return "Sign in first.";
  const { data, error } = await supabase
    .from(TABLE)
    .select("state")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return error.message;
  if (!data?.state) return "No cloud workspace found for this account yet. Push first.";
  localStorage.setItem(STORE_KEY, JSON.stringify(data.state));
  window.location.reload();
  return null;
}

/** When the cloud copy was last updated, or null if none exists. */
export async function cloudMeta(): Promise<CloudMeta | string> {
  if (!supabase) return "Cloud sync is not configured.";
  const session = await getSession();
  if (!session) return "Sign in first.";
  const { data, error } = await supabase
    .from(TABLE)
    .select("updated_at")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return error.message;
  return { updatedAt: data?.updated_at ?? null };
}

// ------------------------------------------------------------
// Auto-sync: push the workspace shortly after any local change.
// ------------------------------------------------------------
const AUTO_SYNC_FLAG = "scenetrackable-autosync";
let autoSyncTimer: number | null = null;
let storageListener: (() => void) | null = null;

export function autoSyncEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SYNC_FLAG) === "1";
  } catch {
    return false;
  }
}

export function setAutoSync(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(AUTO_SYNC_FLAG, "1");
    else localStorage.removeItem(AUTO_SYNC_FLAG);
  } catch {
    /* noop */
  }
  if (enabled) startAutoSync(); else stopAutoSync();
}

/**
 * Debounced push loop. Zustand persist writes to localStorage on every
 * state change; we poll the serialized value cheaply and push ~8s after
 * the last change.
 */
export function startAutoSync(onPushed?: (error: string | null) => void): void {
  if (!cloudEnabled || storageListener) return;
  let lastSnapshot = localStorage.getItem(STORE_KEY);
  const check = () => {
    const now = localStorage.getItem(STORE_KEY);
    if (now !== lastSnapshot) {
      lastSnapshot = now;
      if (autoSyncTimer) window.clearTimeout(autoSyncTimer);
      autoSyncTimer = window.setTimeout(async () => {
        const err = await pushWorkspace();
        onPushed?.(err);
      }, 8000);
    }
  };
  const interval = window.setInterval(check, 3000);
  storageListener = () => window.clearInterval(interval);
}

export function stopAutoSync(): void {
  if (autoSyncTimer) window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;
  storageListener?.();
  storageListener = null;
}

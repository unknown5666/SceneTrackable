// ============================================================
// CLOUD SYNC — Supabase-backed SHARED team workspace (env-gated).
//
// One deployment = one workspace that every SceneTrackable user reads and
// writes. Activates only when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// are set at build time; otherwise the app is purely local and every export
// here degrades to a no-op.
//
// HOW SIGN-IN WORKS (no separate cloud login):
// Supabase Auth accounts are *derived* from the SceneTrackable username +
// password hash, so signing into the app transparently signs into the cloud.
// The Supabase account by itself grants nothing — access comes from the
// workspace_members roster, and the only way onto it is the join_workspace()
// RPC, which re-checks the credential against the workspace's own user list
// server-side. See supabase/schema.sql.
//
// CONCURRENCY: every push carries the rev it was based on. The server
// rejects a stale push instead of clobbering, and we surface that as a
// conflict rather than silently picking a winner.
//
// This module deliberately does NOT import the Zustand store — the store
// imports it, and a cycle here would be fragile. It talks to localStorage
// directly and calls back through registerRehydrate().
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/utils";

const STORE_KEY = "scenetrackable-v1";
const TABLE = "workspaces";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

// Sync bookkeeping has to outlive a page reload: without it a device can't
// tell "I have unpushed offline edits" from "my copy is simply stale", and
// would either clobber the team or silently lose the user's work.
const REV_KEY = "scenetrackable-cloud-rev";
const PUSHED_KEY = "scenetrackable-cloud-pushed";
const USER_KEY = "scenetrackable-cloud-user";

/** Namespaces the derived credentials so they can't collide with anything else. */
const CRED_SALT = "scenetrackable-cloud-v1";
const CRED_DOMAIN = "device.scenetrackable.app";

/** How often to check whether someone else has pushed. */
const POLL_MS = 3 * 60 * 1000;
/** How long after the last local edit to push. */
const PUSH_DEBOUNCE_MS = 8000;
/** How often to notice that localStorage changed. */
const WATCH_MS = 3000;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app was built/served with Supabase credentials. */
export const cloudEnabled: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

// ------------------------------------------------------------
// Persisted-store helpers
//
// Zustand persist stores an envelope: { state: {...}, version: n }. Only the
// inner `state` goes to the cloud — the schema's join_workspace() reads
// state->'users' directly, and an envelope would hide it a level down.
// ------------------------------------------------------------

interface Envelope {
  state: Record<string, unknown>;
  version?: number;
}

function readEnvelope(): Envelope | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.state ? (parsed as Envelope) : null;
  } catch {
    return null;
  }
}

/**
 * Session fields are per-device, not per-workspace: the store persists them
 * alongside the data, and syncing them would make everyone who pulls become
 * whoever pushed last.
 */
const SESSION_KEYS = ["currentUserId", "activeRole"] as const;

function stripSession(state: Record<string, unknown>): Record<string, unknown> {
  const out = { ...state };
  for (const k of SESSION_KEYS) delete out[k];
  return out;
}

/**
 * Write a remote state into localStorage, keeping THIS device's session.
 *
 * Rehydrating makes the store re-serialize itself in its own key order, which
 * rewrites localStorage into a byte-different (but identical) string. So the
 * fingerprint has to be taken AFTER that settles — otherwise every pull looks
 * like a local edit, and two idle devices push each other back and forth
 * forever.
 */
async function applyRemoteState(remote: Record<string, unknown>): Promise<void> {
  const env = readEnvelope();
  const session: Record<string, unknown> = {};
  for (const k of SESSION_KEYS) session[k] = env?.state?.[k] ?? (k === "activeRole" ? null : "");
  const next: Envelope = {
    state: { ...stripSession(remote), ...session },
    version: env?.version ?? 1,
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
  await rehydrateFn?.();
  lastSeenSnapshot = localStorage.getItem(STORE_KEY);
}

// The store owns rehydration; registering avoids a cloud→store import cycle.
let rehydrateFn: (() => Promise<void> | void) | null = null;
export function registerRehydrate(fn: () => Promise<void> | void): void {
  rehydrateFn = fn;
}

// ------------------------------------------------------------
// Sync bookkeeping (survives reload)
// ------------------------------------------------------------

function loadRev(): number | null {
  const v = localStorage.getItem(REV_KEY);
  return v ? Number(v) : null;
}

/** Fingerprint of the state as the cloud last saw it — the dirty check. */
async function stateHash(): Promise<string> {
  const env = readEnvelope();
  if (!env) return "";
  return sha256Hex(JSON.stringify(stripSession(env.state)));
}

/** Record that local and cloud agree at `rev`. */
async function markSynced(rev: number | null): Promise<void> {
  if (rev == null) localStorage.removeItem(REV_KEY);
  else localStorage.setItem(REV_KEY, String(rev));
  localStorage.setItem(PUSHED_KEY, await stateHash());
}

async function isDirty(): Promise<boolean> {
  return (await stateHash()) !== localStorage.getItem(PUSHED_KEY);
}

// ------------------------------------------------------------
// Derived credentials
//
// The email is derived from the username alone (stable per account); the
// password from username + the SceneTrackable password hash. Changing the
// app password therefore changes the device credential — which is exactly
// why an admin reset routes through the invite path, where join_workspace()
// revokes the old identity. See schema.sql.
// ------------------------------------------------------------

interface DerivedCreds {
  email: string;
  password: string;
}

async function deriveCreds(username: string, passwordHash: string): Promise<DerivedCreds> {
  const uname = username.trim().toLowerCase();
  const local = await sha256Hex(`${CRED_SALT}:user:${uname}`);
  const pass = await sha256Hex(`${CRED_SALT}:pass:${uname}:${passwordHash}`);
  // "St1!" keeps the password valid under any reasonable complexity policy.
  return { email: `u${local.slice(0, 32)}@${CRED_DOMAIN}`, password: `St1!${pass}` };
}

// ------------------------------------------------------------
// Observable status
// ------------------------------------------------------------

export type CloudPhase = "off" | "idle" | "connecting" | "connected" | "error";

export interface CloudConflict {
  /** Rev currently on the server that we don't have. */
  rev: number;
  byName: string | null;
  at: string | null;
}

export interface CloudStatus {
  phase: CloudPhase;
  /** SceneTrackable username this device is connected as. */
  username: string | null;
  /** Rev our local state is based on. */
  rev: number | null;
  lastSyncedAt: string | null;
  /** Local edits not yet pushed. */
  dirty: boolean;
  pushing: boolean;
  error: string | null;
  /** Set when the server moved on and we can't safely auto-apply. */
  conflict: CloudConflict | null;
}

let status: CloudStatus = {
  phase: cloudEnabled ? "idle" : "off",
  username: null,
  rev: null,
  lastSyncedAt: null,
  dirty: false,
  pushing: false,
  error: null,
  conflict: null,
};

const listeners = new Set<(s: CloudStatus) => void>();

export function getCloudStatus(): CloudStatus {
  return status;
}

export function subscribeCloud(fn: (s: CloudStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(patch: Partial<CloudStatus>): void {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

// ------------------------------------------------------------
// Connect
// ------------------------------------------------------------

export interface ConnectResult {
  ok: boolean;
  error?: string;
  /** No cloud workspace exists yet — caller may claim it via bootstrapWorkspace(). */
  needsBootstrap?: boolean;
}

interface RpcEnvelope {
  ok?: boolean;
  error?: string;
  needs_bootstrap?: boolean;
  conflict?: boolean;
  rev?: number;
  updated_at?: string;
  updated_by_name?: string | null;
  is_self?: boolean;
}

/**
 * Sign this device into the cloud as `username` and join the shared
 * workspace.
 *
 * `passwordHash` is the stored sha256$… value and is what the device
 * credential is derived from. `gateSecret` is what join_workspace() checks
 * server-side — the same hash normally, or the invite code when redeeming.
 */
export async function cloudConnect(opts: {
  username: string;
  passwordHash: string;
  gateSecret?: string;
  isInvite?: boolean;
}): Promise<ConnectResult> {
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const { username, passwordHash, isInvite = false } = opts;
  const gateSecret = opts.gateSecret ?? passwordHash;

  setStatus({ phase: "connecting", error: null });
  try {
    const creds = await deriveCreds(username, passwordHash);

    let signedIn = false;
    const { error: signInErr } = await supabase.auth.signInWithPassword(creds);
    if (!signInErr) {
      signedIn = true;
    } else {
      // No device account yet for this username+password. Creating one is
      // safe: it grants nothing until join_workspace() accepts the credential.
      const { error: signUpErr } = await supabase.auth.signUp(creds);
      if (signUpErr) {
        setStatus({ phase: "error", error: signUpErr.message });
        return { ok: false, error: signUpErr.message };
      }
      const { error: retryErr } = await supabase.auth.signInWithPassword(creds);
      if (retryErr) {
        // Almost always "Email not confirmed" — a project misconfiguration.
        const msg = /confirm/i.test(retryErr.message)
          ? "Supabase is set to confirm emails. Turn off Authentication → Providers → Email → Confirm email."
          : retryErr.message;
        setStatus({ phase: "error", error: msg });
        return { ok: false, error: msg };
      }
      signedIn = true;
    }
    if (!signedIn) {
      setStatus({ phase: "error", error: "Could not establish a cloud session." });
      return { ok: false, error: "Could not establish a cloud session." };
    }

    const { data, error } = await supabase.rpc("join_workspace", {
      p_username: username.trim(),
      p_secret: gateSecret,
      p_is_invite: isInvite,
    });
    if (error) {
      setStatus({ phase: "error", error: error.message });
      return { ok: false, error: error.message };
    }
    const res = (data ?? {}) as RpcEnvelope;
    if (!res.ok) {
      if (res.needs_bootstrap) {
        setStatus({ phase: "idle", username: username.trim(), error: null });
        return { ok: false, needsBootstrap: true, error: res.error };
      }
      // The device account exists but isn't authorized here — don't leave a
      // half-open session lying around.
      await supabase.auth.signOut();
      setStatus({ phase: "error", error: res.error ?? "Could not join the workspace." });
      return { ok: false, error: res.error ?? "Could not join the workspace." };
    }

    localStorage.setItem(USER_KEY, username.trim());
    setStatus({ phase: "connected", username: username.trim(), error: null, conflict: null });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message || "Cloud connection failed.";
    setStatus({ phase: "error", error: msg });
    return { ok: false, error: msg };
  }
}

/** First run only: claim the singleton workspace from this device's state. */
export async function bootstrapWorkspace(username: string): Promise<ConnectResult> {
  if (!supabase) return { ok: false, error: "Cloud sync is not configured." };
  const env = readEnvelope();
  if (!env) return { ok: false, error: "Nothing to upload yet." };

  const { data, error } = await supabase.rpc("bootstrap_workspace", {
    p_username: username.trim(),
    p_state: stripSession(env.state),
  });
  if (error) {
    setStatus({ phase: "error", error: error.message });
    return { ok: false, error: error.message };
  }
  const res = (data ?? {}) as RpcEnvelope;
  if (!res.ok) {
    setStatus({ phase: "error", error: res.error ?? "Could not create the workspace." });
    return { ok: false, error: res.error ?? "Could not create the workspace." };
  }
  lastSeenSnapshot = localStorage.getItem(STORE_KEY);
  await markSynced(res.rev ?? 1);
  localStorage.setItem(USER_KEY, username.trim());
  setStatus({
    phase: "connected",
    username: username.trim(),
    rev: res.rev ?? 1,
    lastSyncedAt: new Date().toISOString(),
    dirty: false,
    error: null,
    conflict: null,
  });
  return { ok: true };
}

export async function cloudDisconnect(): Promise<void> {
  stopCloudSync();
  await supabase?.auth.signOut();
  setStatus({
    phase: cloudEnabled ? "idle" : "off",
    username: null,
    rev: null,
    dirty: false,
    conflict: null,
    error: null,
  });
}

/** True when this browser already holds a cloud session. */
export async function hasCloudSession(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/**
 * Re-attach after a page reload. Supabase persists its own session, so a
 * returning user is already authenticated and only needs the sync loop
 * restarted — no re-derivation, no prompt.
 */
export async function resumeCloud(): Promise<boolean> {
  if (!cloudEnabled) return false;
  if (status.phase === "connected") return true;
  if (!(await hasCloudSession())) return false;
  setStatus({
    phase: "connected",
    username: localStorage.getItem(USER_KEY),
    error: null,
  });
  startCloudSync();
  await reconcile();
  return true;
}

// ------------------------------------------------------------
// Pull / push
// ------------------------------------------------------------

export async function pullWorkspace(): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const { data, error } = await supabase
    .from(TABLE)
    .select("state, rev, updated_at, updated_by_name")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  if (error) return error.message;
  if (!data?.state) return "No cloud workspace found yet.";

  await applyRemoteState(data.state as Record<string, unknown>);
  await markSynced(data.rev as number);
  setStatus({
    rev: data.rev as number,
    lastSyncedAt: new Date().toISOString(),
    dirty: false,
    conflict: null,
    error: null,
  });
  return null;
}

/**
 * Push local state. Fails with a conflict (rather than overwriting) when the
 * server has moved on, unless `force` is set.
 */
export async function pushWorkspace(force = false): Promise<string | null> {
  if (!supabase) return "Cloud sync is not configured.";
  const env = readEnvelope();
  if (!env) return "Nothing to sync yet.";

  // A null expected_rev tells the server to overwrite unconditionally, so it
  // must only ever come from a deliberate force. Without this guard a device
  // that hasn't pulled yet — reconcile() still in flight, say — would wipe the
  // whole team's workspace with its own stale copy and report success.
  if (!force && status.rev == null) {
    return "Still syncing with the cloud — try again in a moment.";
  }

  setStatus({ pushing: true });
  try {
    const snapshot = localStorage.getItem(STORE_KEY);
    const { data, error } = await supabase.rpc("push_workspace", {
      p_state: stripSession(env.state),
      p_expected_rev: force ? null : status.rev,
      p_actor: status.username,
    });
    if (error) {
      setStatus({ error: error.message });
      return error.message;
    }
    const res = (data ?? {}) as RpcEnvelope;

    if (res.conflict) {
      const head = await fetchHead();
      setStatus({
        conflict: {
          rev: res.rev ?? head?.rev ?? 0,
          byName: head?.updated_by_name ?? null,
          at: head?.updated_at ?? null,
        },
      });
      return "Someone else has pushed changes since you last synced.";
    }
    if (!res.ok) {
      setStatus({ error: res.error ?? "Push failed." });
      return res.error ?? "Push failed.";
    }

    // Anything written while the request was in flight stays dirty and gets
    // picked up by the next debounce, so the fingerprint is taken from the
    // snapshot we actually sent — not from whatever localStorage holds now.
    lastSeenSnapshot = snapshot;
    const sent = JSON.parse(snapshot!) as Envelope;
    localStorage.setItem(PUSHED_KEY, await sha256Hex(JSON.stringify(stripSession(sent.state))));
    if (res.rev != null) localStorage.setItem(REV_KEY, String(res.rev));
    setStatus({
      rev: res.rev ?? null,
      lastSyncedAt: new Date().toISOString(),
      dirty: await isDirty(),
      conflict: null,
      error: null,
    });
    return null;
  } finally {
    setStatus({ pushing: false });
  }
}

async function fetchHead(): Promise<RpcEnvelope | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("workspace_head");
  if (error) return null;
  const res = (data ?? {}) as RpcEnvelope;
  return res.ok ? res : null;
}

/** Discard local edits and take the server's copy. */
export async function resolveConflictTakeRemote(): Promise<string | null> {
  const err = await pullWorkspace();
  if (!err) setStatus({ conflict: null });
  return err;
}

/** Overwrite the server with this device's copy. */
export async function resolveConflictKeepLocal(): Promise<string | null> {
  const head = await fetchHead();
  if (head?.rev != null) setStatus({ rev: head.rev });
  const err = await pushWorkspace(true);
  if (!err) setStatus({ conflict: null });
  return err;
}

// ------------------------------------------------------------
// Sync loop — debounced push + periodic pull
// ------------------------------------------------------------

let watchTimer: number | null = null;
let pollTimer: number | null = null;
let pushTimer: number | null = null;
let lastSeenSnapshot: string | null = null;
let running = false;

/**
 * Called on every poll tick. Auto-applies remote changes when this device has
 * nothing at stake; raises a conflict when it does.
 *
 * A real three-way merge isn't possible here: the whole store is one opaque
 * JSON blob with no per-entity versioning, so there is no honest way to tell
 * a remote edit from a remote deletion. Auto-apply-when-clean plus an explicit
 * prompt when dirty is the most we can do without lying about the outcome.
 */
async function poll(): Promise<void> {
  if (status.phase !== "connected" || status.conflict) return;
  const head = await fetchHead();
  if (!head || head.rev == null) return;
  if (status.rev != null && head.rev <= status.rev) return;

  if (!status.dirty) {
    await pullWorkspace();
    return;
  }
  setStatus({
    conflict: {
      rev: head.rev,
      byName: head.updated_by_name ?? null,
      at: head.updated_at ?? null,
    },
  });
}

function schedulePush(): void {
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    if (status.phase === "connected" && !status.conflict) void pushWorkspace();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Zustand persist rewrites localStorage on every state change, so polling the
 * serialized value is a cheap, dependency-free change signal.
 */
function watch(): void {
  const now = localStorage.getItem(STORE_KEY);
  if (now === lastSeenSnapshot) return;
  lastSeenSnapshot = now;
  setStatus({ dirty: true });
  schedulePush();
}

/**
 * Bring this device in line with the server right after connecting.
 *
 * Ordering matters: a device that was edited offline must push, and a device
 * that merely sat stale must pull. Getting this backwards either loses the
 * user's offline work or overwrites the team's.
 */
export async function reconcile(): Promise<void> {
  if (!supabase || status.phase !== "connected") return;
  const rev = loadRev();
  const dirty = await isDirty();
  setStatus({ rev, dirty });

  const head = await fetchHead();
  if (!head || head.rev == null) return;

  if (rev == null) {
    // Never synced on this device — the workspace is the source of truth.
    await pullWorkspace();
    return;
  }
  if (head.rev > rev) {
    if (dirty) {
      setStatus({
        conflict: { rev: head.rev, byName: head.updated_by_name ?? null, at: head.updated_at ?? null },
      });
    } else {
      await pullWorkspace();
    }
    return;
  }
  if (dirty) await pushWorkspace();
}

export function startCloudSync(): void {
  if (!cloudEnabled || running) return;
  running = true;
  lastSeenSnapshot = localStorage.getItem(STORE_KEY);
  setStatus({ rev: loadRev() });
  void isDirty().then((d) => {
    setStatus({ dirty: d });
    if (d) schedulePush();
  });
  watchTimer = window.setInterval(watch, WATCH_MS);
  pollTimer = window.setInterval(() => void poll(), POLL_MS);
}

export function stopCloudSync(): void {
  running = false;
  if (watchTimer) window.clearInterval(watchTimer);
  if (pollTimer) window.clearInterval(pollTimer);
  if (pushTimer) window.clearTimeout(pushTimer);
  watchTimer = pollTimer = pushTimer = null;
}

/**
 * Force an immediate check for remote changes (the "Sync now" button).
 * Returns a message when the sync couldn't complete, so the caller doesn't
 * report success over a conflict it just raised.
 */
export async function syncNow(): Promise<string | null> {
  if (status.dirty && !status.conflict) {
    const err = await pushWorkspace();
    if (err) return err;
  }
  await poll();
  return status.conflict ? "Someone else has pushed changes since you last synced." : null;
}

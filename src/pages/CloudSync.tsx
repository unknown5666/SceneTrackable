import React, { useEffect, useState } from "react";
import { Cloud, CloudUpload, CloudDownload, LogOut, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  cloudEnabled,
  supabase,
  getSession,
  signIn,
  signUp,
  signOut,
  pushWorkspace,
  pullWorkspace,
  cloudMeta,
  autoSyncEnabled,
  setAutoSync,
} from "@/lib/cloud";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";

export function CloudSync() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [lastCloudUpdate, setLastCloudUpdate] = useState<string | null>(null);
  const [auto, setAuto] = useState(autoSyncEnabled());

  const refreshMeta = async () => {
    const meta = await cloudMeta();
    if (typeof meta !== "string") setLastCloudUpdate(meta.updatedAt);
  };

  useEffect(() => {
    if (!cloudEnabled) return;
    getSession().then((s) => {
      setSession(s);
      if (s) refreshMeta();
    });
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const doAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const err = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) setMsg({ tone: "err", text: err });
    else if (mode === "signup")
      setMsg({ tone: "ok", text: "Account created. Check your email if confirmation is required, then sign in." });
    else refreshMeta();
  };

  const doPush = async () => {
    setBusy(true);
    setMsg(null);
    const err = await pushWorkspace();
    setBusy(false);
    setMsg(err ? { tone: "err", text: err } : { tone: "ok", text: "Workspace pushed to the cloud." });
    if (!err) refreshMeta();
  };

  const doPull = async () => {
    if (!confirm("Pulling replaces ALL local data with the cloud copy and reloads the app. Continue?")) return;
    setBusy(true);
    const err = await pullWorkspace();
    setBusy(false);
    if (err) setMsg({ tone: "err", text: err });
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    setAutoSync(next);
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Cloud size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header">Cloud</div>
          <div className="page-title">Cloud Sync</div>
        </div>
      </div>

      {!cloudEnabled ? (
        <Card>
          <CardHeader title="Not configured yet" subtitle="Cloud sync activates when Supabase credentials are provided at build time." />
          <ol className="text-sm text-[var(--text-secondary)] space-y-2 list-decimal list-inside">
            <li>Create a free project at <span className="font-mono text-xs">supabase.com</span>.</li>
            <li>In the Supabase SQL Editor, run the contents of <span className="font-mono text-xs">supabase/schema.sql</span> (in this repo).</li>
            <li>Copy the project URL and anon key from Project Settings → API.</li>
            <li>
              Set <span className="font-mono text-xs">VITE_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</span> in a local{" "}
              <span className="font-mono text-xs">.env</span> file (and in Vercel → Project → Environment Variables for the hosted app).
            </li>
            <li>Rebuild / redeploy. This page then turns into the sign-in and sync console.</li>
          </ol>
        </Card>
      ) : !session ? (
        <Card>
          <CardHeader
            title={mode === "signin" ? "Sign in to your cloud account" : "Create a cloud account"}
            subtitle="One cloud account = one synced workspace (all projects, users, and breakdowns)."
          />
          <form onSubmit={doAuth} className="space-y-4 max-w-sm">
            <div>
              <label className="section-header block mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full" placeholder="you@company.com" />
            </div>
            <div>
              <label className="section-header block mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full" placeholder="••••••••" />
            </div>
            {msg && (
              <div className={`text-xs ${msg.tone === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                {msg.text}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || !email || password.length < 6}>
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
              <button
                type="button"
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader
                title="Connected"
                subtitle={`Signed in as ${session.user.email}`}
                className="mb-0"
              />
              <div className="flex items-center gap-2">
                <Badge tone="success" dot>Cloud active</Badge>
                <Button size="sm" variant="ghost" onClick={() => signOut()}>
                  <LogOut size={13} /> Sign out
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Sync"
              subtitle={
                lastCloudUpdate
                  ? `Cloud copy last updated ${formatDateTime(lastCloudUpdate)}`
                  : "No cloud copy yet — push to create one."
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={doPush} disabled={busy}>
                <CloudUpload size={14} /> Push local → cloud
              </Button>
              <Button variant="secondary" onClick={doPull} disabled={busy}>
                <CloudDownload size={14} /> Pull cloud → local
              </Button>
              <Button variant="ghost" onClick={refreshMeta} disabled={busy}>
                <RefreshCw size={14} /> Refresh
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <input type="checkbox" checked={auto} onChange={toggleAuto} className="accent-[var(--accent-blue)]" />
              <span className="text-[var(--text-primary)]">Auto-sync — push changes to the cloud ~8s after any edit</span>
            </label>
            {msg && (
              <div className={`flex items-center gap-1.5 text-xs mt-3 ${msg.tone === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
                {msg.tone === "err" ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
                {msg.text}
              </div>
            )}
            <div className="text-[11px] text-[var(--text-muted)] mt-4">
              Push overwrites the cloud copy; pull overwrites this browser. On a new device: sign in here, then pull.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

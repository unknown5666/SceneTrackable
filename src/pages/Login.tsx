import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clapperboard, Sun, Moon, ArrowRight, Lock, KeyRound } from "lucide-react";
import { useStore } from "@/state/store";
import { useTheme } from "@/state/theme";
import { Button } from "@/components/ui/Button";
import { Footer } from "@/components/layout/Footer";

type Mode = "signin" | "redeem";

export function Login() {
  const nav = useNavigate();
  const login = useStore((s) => s.login);
  const isInvitePending = useStore((s) => s.isInvitePending);
  const redeemInvite = useStore((s) => s.redeemInvite);
  const userId = useStore((s) => s.currentUserId);
  const { theme, toggle } = useTheme();

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (userId) nav("/projects", { replace: true });
  }, [userId, nav]);

  const clearError = () => setError("");

  const submitSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // If this account is holding an invite, guide them to the redeem step.
      if (isInvitePending(username)) {
        setMode("redeem");
        setError("This account still needs a password. Enter your invite code and pick one.");
        return;
      }
      const ok = await login(username, password);
      if (ok) nav("/projects", { replace: true });
      else setError("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  };

  const submitRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const err = await redeemInvite(username, inviteCode, newPassword);
      if (err) {
        setError(err);
      } else {
        nav("/projects", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4F7BF7 0%, #8B5CF6 100%)" }}
          >
            <Clapperboard size={20} className="text-white" />
          </div>
          <div className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Scene<span className="text-[var(--accent-blue)]">Trackable</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={toggle}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </header>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-4xl grid lg:grid-cols-2 gap-10 items-center">
          {/* Pitch */}
          <div className="hidden lg:block">
            <div className="section-header text-[var(--accent-blue)]">AI Script Breakdown Platform</div>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              Upload the script.
              <br />
              Get the whole breakdown.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)] max-w-md">
              SceneTrackable reads your screenplay and produces a production-ready breakdown —
              scenes, locations, cast, extras, props, wardrobe, SFX, VFX, vehicles, animals and
              production requirements — every element editable, categorized, and day/night tagged.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Scenes", "Locations", "Cast", "Props", "Wardrobe", "SFX / VFX", "Vehicles", "Animals"].map(
                (t) => (
                  <span
                    key={t}
                    className="text-xs px-2.5 py-1 rounded-full border border-[var(--border-default)] text-[var(--text-secondary)]"
                  >
                    {t}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl border border-[var(--border-default)] p-8 relative overflow-hidden"
            style={{ background: "var(--bg-surface)" }}
          >
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: "linear-gradient(90deg, #4F7BF7, #8B5CF6)" }}
            />
            <div className="flex items-center gap-2 mb-1">
              {mode === "signin" ? (
                <Lock size={14} className="text-[var(--text-muted)]" />
              ) : (
                <KeyRound size={14} className="text-[var(--text-muted)]" />
              )}
              <span className="section-header">
                {mode === "signin" ? "Sign in" : "Redeem invite"}
              </span>
            </div>
            <div className="text-xl font-semibold text-[var(--text-primary)] mb-6">
              {mode === "signin" ? "Welcome back" : "Set your password"}
            </div>

            {mode === "signin" ? (
              <form onSubmit={submitSignin} className="space-y-4">
                <div>
                  <label className="section-header block mb-1.5">Username</label>
                  <input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearError();
                    }}
                    placeholder="Admin"
                    autoFocus
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="section-header block mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError();
                    }}
                    placeholder="••••"
                    className="w-full"
                  />
                </div>
                {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
                <Button type="submit" className="w-full justify-center" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"} <ArrowRight size={14} />
                </Button>
                <button
                  type="button"
                  className="w-full text-[11px] text-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    setMode("redeem");
                    clearError();
                  }}
                >
                  Got an invite code? Redeem it →
                </button>
              </form>
            ) : (
              <form onSubmit={submitRedeem} className="space-y-4">
                <div>
                  <label className="section-header block mb-1.5">Username</label>
                  <input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      clearError();
                    }}
                    placeholder="jane"
                    autoFocus
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="section-header block mb-1.5">Invite code</label>
                  <input
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      clearError();
                    }}
                    placeholder="ABC12345"
                    className="w-full font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="section-header block mb-1.5">New password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        clearError();
                      }}
                      placeholder="••••••"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="section-header block mb-1.5">Confirm</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearError();
                      }}
                      placeholder="••••••"
                      className="w-full"
                    />
                  </div>
                </div>
                {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
                <Button
                  type="submit"
                  className="w-full justify-center"
                  disabled={busy || !username || !inviteCode || !newPassword}
                >
                  {busy ? "Setting password…" : "Set password & sign in"} <ArrowRight size={14} />
                </Button>
                <button
                  type="button"
                  className="w-full text-[11px] text-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    setMode("signin");
                    clearError();
                  }}
                >
                  ← Back to sign in
                </button>
              </form>
            )}

            <div className="mt-5 text-[11px] text-center text-[var(--text-muted)]">
              First-time master login — <span className="text-[var(--text-secondary)]">Admin</span> /{" "}
              <span className="text-[var(--text-secondary)]">1234</span>. Change it in Admin → Users.
            </div>
          </div>
        </div>
      </div>

      <Footer className="pb-6" />
    </div>
  );
}

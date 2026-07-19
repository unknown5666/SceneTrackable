import React, { useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Shield, Plus, Trash2, UserPlus, KeyRound, Users as UsersIcon, Lock, Database, Download, Upload, Mail, Copy, RefreshCw, History, Sparkle, Cloud } from "lucide-react";
import { useStore } from "@/state/store";
import { ACCESS_KEYS, PERMISSION_LEVELS, ROLE_PRESETS, permissionMap } from "@/data/roles";
import { isAdminRole, permissionFor, accessFromPermissions } from "@/types";
import { hashPassword } from "@/lib/utils";
import { exportBackup, exportProject, importBackup, restoreFullBackup } from "@/lib/export";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { HelpButton } from "@/components/ui/HelpButton";
import { AISettings } from "@/pages/AISettings";
import { CloudSync } from "@/pages/CloudSync";
import type { Role, PermissionLevel, RolePermissions } from "@/types";

type AdminTab = "users" | "ai" | "cloud" | "data";
const ADMIN_TABS = [
  { id: "users", label: (<span className="flex items-center gap-1.5"><UsersIcon size={13} /> Users &amp; Roles</span>) },
  { id: "ai", label: (<span className="flex items-center gap-1.5"><Sparkle size={13} /> AI</span>) },
  { id: "cloud", label: (<span className="flex items-center gap-1.5"><Cloud size={13} /> Cloud</span>) },
  { id: "data", label: (<span className="flex items-center gap-1.5"><Database size={13} /> Data</span>) },
];

/**
 * The levels to show in the editor for an existing role. Admin roles carry no
 * map (their "all" already means write everywhere), so unchecking admin starts
 * them from a clean slate rather than silently granting the lot.
 */
function levelsOf(role: Role): RolePermissions {
  const map = permissionMap();
  if (isAdminRole(role)) return map;
  for (const { key } of ACCESS_KEYS) map[key] = permissionFor(role, key);
  return map;
}

const LEVEL_TONE: Record<PermissionLevel, string> = {
  none: "text-[var(--text-muted)]",
  read: "text-[var(--text-secondary)]",
  write: "text-[var(--accent-blue)]",
};

export function Admin() {
  const users = useStore((s) => s.users);
  const roles = useStore((s) => s.roles);
  const currentUserId = useStore((s) => s.currentUserId);
  const addUser = useStore((s) => s.addUser);
  const inviteUser = useStore((s) => s.inviteUser);
  const updateUser = useStore((s) => s.updateUser);
  const resetUserInvite = useStore((s) => s.resetUserInvite);
  const removeUser = useStore((s) => s.removeUser);
  const addRole = useStore((s) => s.addRole);
  const updateRole = useStore((s) => s.updateRole);
  const removeRole = useStore((s) => s.removeRole);

  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: AdminTab =
    rawTab === "ai" || rawTab === "cloud" || rawTab === "data" ? rawTab : "users";
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState("");
  const [invUsername, setInvUsername] = useState("");
  const [invRole, setInvRole] = useState(roles.find((r) => !isAdminRole(r))?.id ?? roles[0]?.id ?? "");
  const [issuedCode, setIssuedCode] = useState<{ username: string; code: string } | null>(null);

  const openInvite = () => {
    setInvName("");
    setInvUsername("");
    setInvRole(roles.find((r) => !isAdminRole(r))?.id ?? roles[0]?.id ?? "");
    setIssuedCode(null);
    setInviteOpen(true);
  };

  const sendInvite = () => {
    if (!invName.trim() || !invUsername.trim()) return;
    const code = inviteUser({
      displayName: invName.trim(),
      username: invUsername.trim(),
      roleId: invRole,
    });
    setIssuedCode({ username: invUsername.trim(), code });
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* noop */
    }
  };

  const doResetInvite = (uid: string, name: string) => {
    if (!confirm(`Reset “${name}”'s login? Their current password will be cleared.`)) return;
    const code = resetUserInvite(uid);
    if (code) setIssuedCode({ username: users.find((u) => u.id === uid)?.username ?? "", code });
  };

  const roleLabel = (id: string) => roles.find((r) => r.id === id)?.label ?? id;

  // ---- User modal ----
  const [userModal, setUserModal] = useState<null | { id?: string }>(null);
  const [uName, setUName] = useState("");
  const [uDisplay, setUDisplay] = useState("");
  const [uPass, setUPass] = useState("");
  const [uRole, setURole] = useState(roles[0]?.id ?? "");

  const openAddUser = () => {
    setUserModal({});
    setUName("");
    setUDisplay("");
    setUPass("");
    setURole(roles.find((r) => !isAdminRole(r))?.id ?? roles[0]?.id ?? "");
  };
  const openEditUser = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    setUserModal({ id });
    setUName(u.username);
    setUDisplay(u.displayName);
    setUPass(""); // blank = keep the current password
    setURole(u.roleId);
  };
  const saveUser = async () => {
    if (!uName.trim() || !uDisplay.trim()) return;
    if (userModal?.id) {
      const patch: { username: string; displayName: string; roleId: string; password?: string } = {
        username: uName.trim(),
        displayName: uDisplay.trim(),
        roleId: uRole,
      };
      if (uPass) patch.password = await hashPassword(uPass);
      updateUser(userModal.id, patch);
    } else {
      if (!uPass) return;
      addUser({
        username: uName.trim(),
        displayName: uDisplay.trim(),
        password: await hashPassword(uPass),
        roleId: uRole,
        active: true,
      });
    }
    setUserModal(null);
  };

  // ---- Role modal ----
  const [roleModal, setRoleModal] = useState<null | { id?: string }>(null);
  const [rLabel, setRLabel] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rAdmin, setRAdmin] = useState(false);
  const [rPerms, setRPerms] = useState<RolePermissions>(permissionMap());
  const [rPreset, setRPreset] = useState<string>("");

  const openAddRole = () => {
    setRoleModal({});
    setRLabel("");
    setRDesc("");
    setRAdmin(false);
    setRPerms(permissionMap());
    setRPreset("");
  };
  const openEditRole = (role: Role) => {
    setRoleModal({ id: role.id });
    setRLabel(role.label);
    setRDesc(role.description);
    setRAdmin(isAdminRole(role));
    setRPerms(levelsOf(role));
    setRPreset("");
  };
  const saveRole = () => {
    if (!rLabel.trim()) return;
    const patch = rAdmin
      ? { label: rLabel.trim(), description: rDesc.trim(), access: ["all"] }
      : {
          label: rLabel.trim(),
          description: rDesc.trim(),
          access: accessFromPermissions(rPerms),
          permissions: rPerms,
        };
    if (roleModal?.id) {
      const err = updateRole(roleModal.id, patch);
      if (err) return alert(err);
    } else {
      addRole(patch);
    }
    setRoleModal(null);
  };
  const deleteRole = (id: string) => {
    const err = removeRole(id);
    if (err) alert(err);
  };

  const setLevel = (key: string, level: PermissionLevel) => {
    setRPerms((prev) => ({ ...prev, [key]: level }));
    setRPreset(""); // hand-edited — no longer the preset as shipped
  };
  const setAllLevels = (level: PermissionLevel) => {
    setRPerms(
      level === "none"
        ? permissionMap()
        : permissionMap(
            level === "read" ? ACCESS_KEYS.map((k) => k.key) : [],
            level === "write" ? ACCESS_KEYS.map((k) => k.key) : []
          )
    );
    setRPreset("");
  };
  const applyPreset = (presetId: string) => {
    const preset = ROLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setRPreset(preset.id);
    setRAdmin(!!preset.admin);
    setRPerms({ ...preset.permissions });
    if (!rLabel.trim()) setRLabel(preset.label);
    if (!rDesc.trim()) setRDesc(preset.description);
  };

  // ---- Backup / restore ----
  const restoreInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  // Additive restore: merge the file's project(s) into this workspace.
  const onRestoreFile = async (file: File) => {
    if (
      !confirm(
        "Import the project(s) from this file into your workspace? A project with the same name is updated; the rest are added. Your other projects, users, and roles are left untouched. The app will reload."
      )
    )
      return;
    const err = await importBackup(file);
    if (err) alert(err);
  };

  // Destructive: replace the entire workspace with a full backup.
  const onReplaceFile = async (file: File) => {
    if (
      !confirm(
        "REPLACE EVERYTHING? This wipes all current projects, users, and roles and swaps in the full backup. This cannot be undone. The app will reload."
      )
    )
      return;
    const err = await restoreFullBackup(file);
    if (err) alert(err);
  };

  const onExportProject = () => {
    const err = exportProject();
    if (err) alert(err);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Shield size={18} className="text-[var(--accent-blue)]" />
        <div>
          <div className="section-header flex items-center gap-1.5">
            Administration <HelpButton doc="admin" />
          </div>
          <div className="page-title">Admin Console</div>
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={ADMIN_TABS} />

      {tab === "ai" && <AISettings embedded />}
      {tab === "cloud" && <CloudSync embedded />}

      {tab === "data" && (
        <div className="space-y-6">
          {/* Data backup / restore */}
          <Card padding="none">
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <CardHeader
                title={<span className="flex items-center gap-2"><Database size={13} /> Backup & restore</span>}
                subtitle="Download the whole workspace or just the current project. Restoring MERGES a file's project(s) in — it doesn't wipe anything."
                className="mb-0"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={exportBackup}>
                  <Download size={13} /> Download full backup
                </Button>
                <Button size="sm" variant="secondary" onClick={onExportProject}>
                  <Download size={13} /> Download this project
                </Button>
                <Button size="sm" onClick={() => restoreInput.current?.click()}>
                  <Upload size={13} /> Restore (merge)
                </Button>
                <input
                  ref={restoreInput}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onRestoreFile(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {/* Danger: full-workspace replace, kept separate from the safe merge path */}
            <div className="px-4 py-3 border-t border-[var(--border-default)] flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">Replace entire workspace</span> — swap
                everything (projects, users, roles) for a full backup. Destructive.
              </div>
              <Button size="sm" variant="ghost" onClick={() => replaceInput.current?.click()}>
                <Upload size={13} /> Replace everything…
              </Button>
              <input
                ref={replaceInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onReplaceFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </Card>

          {/* Activity log link */}
          <Card>
            <div className="flex items-center justify-between">
              <CardHeader
                title={<span className="flex items-center gap-2"><History size={13} /> Activity log</span>}
                subtitle="Every change across the workspace — who did what, and when."
                className="mb-0"
              />
              <Button size="sm" variant="secondary" onClick={() => nav("/activity")}>
                Open activity log
              </Button>
            </div>
          </Card>
        </div>
      )}

      {tab === "users" && (
      <div className="space-y-6">
      {/* Users */}
      <Card padding="none">
        <div className="p-4 flex items-center justify-between">
          <CardHeader title={<span className="flex items-center gap-2"><UsersIcon size={13} /> Users</span>} subtitle={`${users.length} accounts`} className="mb-0" />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={openAddUser}>
              <UserPlus size={13} /> Add user
            </Button>
            <Button size="sm" onClick={openInvite}>
              <Mail size={13} /> Invite by code
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="pos-table text-sm">
            <thead>
              <tr>
                <th>User</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isInvitePending = !!u.inviteCode && !u.password;
                return (
                  <tr key={u.id}>
                    <td className="font-medium">
                      {u.displayName}
                      {u.id === currentUserId && (
                        <span className="text-[var(--text-muted)] font-normal"> (you)</span>
                      )}
                    </td>
                    <td className="text-[var(--text-secondary)] font-mono text-xs">{u.username}</td>
                    <td>
                      {isAdminRole(roles.find((r) => r.id === u.roleId)) ? (
                        <Badge tone="ai">{roleLabel(u.roleId)}</Badge>
                      ) : (
                        <Badge tone="muted">{roleLabel(u.roleId)}</Badge>
                      )}
                    </td>
                    <td>
                      {isInvitePending ? (
                        <Badge tone="warning" dot>
                          Invite pending
                        </Badge>
                      ) : (
                        <button
                          onClick={() => updateUser(u.id, { active: !u.active })}
                          disabled={u.id === currentUserId}
                        >
                          <Badge tone={u.active ? "success" : "muted"} dot>
                            {u.active ? "Active" : "Disabled"}
                          </Badge>
                        </button>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isInvitePending && u.inviteCode && (
                          <button
                            className="text-[11px] font-mono px-2 py-1 rounded bg-[var(--bg-surface-hover)] text-[var(--text-primary)] hover:text-[var(--accent-blue)] flex items-center gap-1"
                            onClick={() =>
                              setIssuedCode({ username: u.username, code: u.inviteCode! })
                            }
                            title="Show invite code again"
                          >
                            <KeyRound size={11} /> Show code
                          </button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEditUser(u.id)}>
                          <KeyRound size={13} /> Edit
                        </Button>
                        {u.id !== currentUserId && (
                          <button
                            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--accent-blue)]"
                            onClick={() => doResetInvite(u.id, u.displayName)}
                            title="Reset login — clears password and issues a new invite code"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (u.id === currentUserId) return alert("You can't delete your own account.");
                            if (confirm(`Delete user “${u.displayName}”?`)) removeUser(u.id);
                          }}
                          disabled={u.id === currentUserId}
                          className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] disabled:opacity-30"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Roles */}
      <Card padding="none">
        <div className="p-4 flex items-center justify-between">
          <CardHeader title={<span className="flex items-center gap-2"><Lock size={13} /> Roles</span>} subtitle={`${roles.length} roles`} className="mb-0" />
          <Button size="sm" onClick={openAddRole}>
            <Plus size={13} /> Add role
          </Button>
        </div>
        <div className="divide-y divide-[var(--border-default)]">
          {roles.map((r) => (
            <div key={r.id} className="p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)]">{r.label}</span>
                  {r.builtIn && <Badge tone="muted">Built-in</Badge>}
                  {isAdminRole(r) && <Badge tone="ai">Full access</Badge>}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">{r.description}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {isAdminRole(r) ? (
                    <span className="text-[11px] text-[var(--text-muted)]">All pages + user/role management + AI settings</span>
                  ) : r.access.length ? (
                    r.access.map((a) => {
                      const level = permissionFor(r, a);
                      return (
                        <span
                          key={a}
                          title={level === "write" ? "Read & write" : "Read only"}
                          className={`text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] ${
                            level === "write"
                              ? "text-[var(--accent-blue)]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {ACCESS_KEYS.find((k) => k.key === a)?.label ?? a}
                          <span className="opacity-60"> · {level === "write" ? "RW" : "R"}</span>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">Dashboard only</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEditRole(r)}>
                  Edit
                </Button>
                {!r.builtIn && (
                  <button
                    onClick={() => deleteRole(r.id)}
                    className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      </div>
      )}

      {/* User modal */}
      <Modal
        open={!!userModal}
        onClose={() => setUserModal(null)}
        title={userModal?.id ? "Edit user" : "Add user"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUserModal(null)}>Cancel</Button>
            <Button onClick={saveUser} disabled={!uName.trim() || !uDisplay.trim() || (!userModal?.id && !uPass)}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="section-header block mb-1.5">Display name</label>
            <input value={uDisplay} onChange={(e) => setUDisplay(e.target.value)} className="w-full" placeholder="Jane Producer" />
          </div>
          <div>
            <label className="section-header block mb-1.5">Username</label>
            <input value={uName} onChange={(e) => setUName(e.target.value)} className="w-full" placeholder="jane" />
          </div>
          <div>
            <label className="section-header block mb-1.5">Password</label>
            <input
              type="password"
              value={uPass}
              onChange={(e) => setUPass(e.target.value)}
              className="w-full"
              placeholder={userModal?.id ? "Leave blank to keep current password" : "••••"}
            />
          </div>
          <div>
            <label className="section-header block mb-1.5">Role</label>
            <select value={uRole} onChange={(e) => setURole(e.target.value)} className="w-full">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setIssuedCode(null);
        }}
        title={issuedCode ? "Invite issued" : "Invite user"}
        subtitle={
          issuedCode
            ? "Share these credentials with the user. They redeem the code on the login page."
            : "Create an account; the user picks their own password on first sign-in."
        }
        footer={
          issuedCode ? (
            <Button onClick={() => { setInviteOpen(false); setIssuedCode(null); }}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={sendInvite} disabled={!invName.trim() || !invUsername.trim()}>
                Generate invite
              </Button>
            </>
          )
        }
      >
        {issuedCode ? (
          <div className="space-y-4">
            <div>
              <div className="section-header mb-1.5">Username</div>
              <div className="font-mono text-sm text-[var(--text-primary)] bg-[var(--bg-surface-hover)] rounded px-3 py-2">
                {issuedCode.username}
              </div>
            </div>
            <div>
              <div className="section-header mb-1.5">One-time invite code</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-lg tracking-widest text-[var(--text-primary)] bg-[var(--bg-surface-hover)] rounded px-3 py-2 flex-1">
                  {issuedCode.code}
                </div>
                <Button variant="secondary" size="sm" onClick={() => copyCode(issuedCode.code)}>
                  <Copy size={13} /> Copy
                </Button>
              </div>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              The user visits the login page, clicks “Got an invite code? Redeem it →”,
              enters their username + this code, then sets their own password.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="section-header block mb-1.5">Display name</label>
              <input
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                className="w-full"
                placeholder="Jane Producer"
                autoFocus
              />
            </div>
            <div>
              <label className="section-header block mb-1.5">Username</label>
              <input
                value={invUsername}
                onChange={(e) => setInvUsername(e.target.value)}
                className="w-full"
                placeholder="jane"
              />
            </div>
            <div>
              <label className="section-header block mb-1.5">Role</label>
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value)}
                className="w-full"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Modal>

      {/* Role modal */}
      <Modal
        open={!!roleModal}
        onClose={() => setRoleModal(null)}
        title={roleModal?.id ? "Edit role" : "Add role"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleModal(null)}>Cancel</Button>
            <Button onClick={saveRole} disabled={!rLabel.trim()}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="section-header block mb-1.5">Role name</label>
            <input value={rLabel} onChange={(e) => setRLabel(e.target.value)} className="w-full" placeholder="e.g. Line Producer" />
          </div>
          <div>
            <label className="section-header block mb-1.5">Description</label>
            <input value={rDesc} onChange={(e) => setRDesc(e.target.value)} className="w-full" placeholder="What this role does" />
          </div>

          {/* Presets — a starting point; every page stays editable below. */}
          <div>
            <label className="section-header block mb-1.5">Start from a preset</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  title={p.description}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                    rPreset === p.id
                      ? "border-[var(--accent-blue)] text-[var(--accent-blue)] bg-[var(--bg-surface-hover)]"
                      : "border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1.5">
              {rPreset
                ? ROLE_PRESETS.find((p) => p.id === rPreset)?.description
                : "Optional. Applying a preset fills the grid below — tune any page afterwards."}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={rAdmin} onChange={(e) => { setRAdmin(e.target.checked); setRPreset(""); }} className="accent-[var(--color-ai)]" />
            <span className="text-[var(--text-primary)]">Administrator — full access (users, roles, AI settings)</span>
          </label>

          {!rAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="section-header">Page permissions</label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-[var(--text-muted)] mr-1">Set all</span>
                  {PERMISSION_LEVELS.map((l) => (
                    <button
                      key={l.level}
                      type="button"
                      onClick={() => setAllLevels(l.level)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded border border-[var(--border-default)] divide-y divide-[var(--border-default)]">
                {ACCESS_KEYS.map((k) => {
                  const level = rPerms[k.key] ?? "none";
                  return (
                    <div key={k.key} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className={`text-sm ${LEVEL_TONE[level]}`}>{k.label}</span>
                      <div className="flex items-center rounded overflow-hidden border border-[var(--border-default)] shrink-0">
                        {PERMISSION_LEVELS.map((l) => (
                          <button
                            key={l.level}
                            type="button"
                            title={l.hint}
                            onClick={() => setLevel(k.key, l.level)}
                            className={`text-[11px] px-2 py-1 transition-colors ${
                              level === l.level
                                ? "bg-[var(--accent-blue)] text-white"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                            }`}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-2">
                “Read” opens the page with every control disabled. Dashboard, Projects,
                Notifications & Tutorial are available to everyone.
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

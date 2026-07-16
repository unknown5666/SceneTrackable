-- ============================================================
-- SceneTrackable cloud sync schema  (v2 — shared team workspace)
--
-- Run this once in your Supabase project:
--   SQL Editor → New query → paste → Run.
-- It is idempotent; re-running it is safe.
--
-- MODEL: one deployment = ONE shared production workspace that every
-- SceneTrackable user reads and writes. Supabase Auth accounts exist only
-- as per-device identities; the real gate is `workspace_members`, and the
-- only way onto that roster is join_workspace(), which validates the
-- caller against the SceneTrackable user list inside the state blob.
-- Signing up alone therefore grants nothing.
--
-- IMPORTANT — before deploying:
--   1. Authentication → Providers → Email: turn OFF "Confirm email".
--      The app creates device accounts silently and cannot click a link.
--   2. The FIRST person to sign in on a fresh deployment claims the
--      workspace (see bootstrap_workspace). Sign in as your admin
--      immediately after deploying, before sharing the URL.
--   3. Change the seeded Admin/1234 password. Cloud access is derived
--      from the SceneTrackable password, so it is only as strong as that.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table if not exists public.workspaces (
  id              uuid primary key,
  state           jsonb  not null,
  -- Bumped on every successful push. Clients send the rev they based their
  -- edit on; a mismatch means someone else pushed first (see push_workspace).
  rev             bigint not null default 1,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,
  updated_by_name text
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  app_username text not null,
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_username_idx
  on public.workspace_members (workspace_id, lower(app_username));

-- ------------------------------------------------------------
-- The singleton workspace id
-- ------------------------------------------------------------

create or replace function public.st_workspace_id()
returns uuid language sql immutable as $$
  select '00000000-0000-0000-0000-000000000001'::uuid;
$$;

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;

-- SECURITY DEFINER so the workspaces policies can consult the roster without
-- recursing back through workspace_members' own RLS.
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
  );
$$;

drop policy if exists "Members read their workspace" on public.workspaces;
create policy "Members read their workspace" on public.workspaces
  for select using (public.is_workspace_member(id));

drop policy if exists "Members write their workspace" on public.workspaces;
create policy "Members write their workspace" on public.workspaces
  for update using (public.is_workspace_member(id))
  with check (public.is_workspace_member(id));

-- No direct INSERT/DELETE policy on workspaces: creation goes through
-- bootstrap_workspace() and nothing is allowed to drop the row.

drop policy if exists "Members read the roster" on public.workspace_members;
create policy "Members read the roster" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));

-- No direct write policy on workspace_members: joins go through
-- join_workspace(), which is the credential gate.

-- ------------------------------------------------------------
-- bootstrap_workspace — first run only
--
-- Creates the singleton workspace from the caller's local state and makes
-- them its first member. Fails once the workspace exists, so this is a
-- one-shot land-grab: claim it during setup, before sharing the URL.
-- ------------------------------------------------------------
create or replace function public.bootstrap_workspace(p_username text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := public.st_workspace_id();
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  end if;
  if p_username is null or length(trim(p_username)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Username is required.');
  end if;
  if exists (select 1 from public.workspaces where id = v_id) then
    return jsonb_build_object('ok', false, 'error', 'Workspace already exists.');
  end if;

  insert into public.workspaces (id, state, rev, updated_by, updated_by_name)
  values (v_id, p_state, 1, auth.uid(), trim(p_username));

  insert into public.workspace_members (workspace_id, user_id, app_username)
  values (v_id, auth.uid(), trim(p_username));

  return jsonb_build_object('ok', true, 'workspace_id', v_id, 'rev', 1);
end;
$$;

-- ------------------------------------------------------------
-- join_workspace — the credential gate
--
-- p_secret is either the caller's SHA-256 password hash exactly as stored in
-- state.users[].password ("sha256$…"), or their invite code when
-- p_is_invite is true. Both are proof of knowledge of something only a real
-- SceneTrackable account holder has.
-- ------------------------------------------------------------
create or replace function public.join_workspace(
  p_username  text,
  p_secret    text,
  p_is_invite boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ws   public.workspaces;
  v_user jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  end if;
  if p_username is null or length(trim(p_username)) = 0
     or p_secret is null or length(p_secret) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Username and credential are required.');
  end if;

  select * into v_ws from public.workspaces where id = public.st_workspace_id();
  if v_ws.id is null then
    -- Nothing to join yet. The client falls back to bootstrap_workspace().
    return jsonb_build_object('ok', false, 'needs_bootstrap', true,
                              'error', 'No cloud workspace exists yet.');
  end if;

  select t.u into v_user
  from jsonb_array_elements(coalesce(v_ws.state -> 'users', '[]'::jsonb)) as t(u)
  where lower(t.u ->> 'username') = lower(trim(p_username))
    and coalesce((t.u ->> 'active')::boolean, true)
  limit 1;

  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'No such user in this workspace.');
  end if;

  if p_is_invite then
    if coalesce(v_user ->> 'inviteCode', '') = ''
       or v_user ->> 'inviteCode' <> p_secret then
      return jsonb_build_object('ok', false, 'error', 'Invite code does not match.');
    end if;
    -- Redeeming an invite revokes this app account's previous device
    -- identities. This is the path an admin-initiated password reset takes,
    -- so it is what actually cuts off the old password's cloud access.
    delete from public.workspace_members
     where workspace_id = v_ws.id
       and lower(app_username) = lower(trim(p_username))
       and user_id <> auth.uid();
  else
    if coalesce(v_user ->> 'password', '') = ''
       or v_user ->> 'password' <> p_secret then
      return jsonb_build_object('ok', false, 'error', 'Incorrect password.');
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, app_username)
  values (v_ws.id, auth.uid(), trim(p_username))
  on conflict (workspace_id, user_id)
    do update set app_username = excluded.app_username;

  return jsonb_build_object('ok', true, 'workspace_id', v_ws.id, 'rev', v_ws.rev);
end;
$$;

-- ------------------------------------------------------------
-- push_workspace — optimistic-concurrency write
--
-- Returns {ok:false, conflict:true, rev:<current>} when someone else pushed
-- since p_expected_rev, so the client can surface it instead of clobbering.
-- Pass p_expected_rev = null to force-overwrite deliberately.
-- ------------------------------------------------------------
create or replace function public.push_workspace(
  p_state        jsonb,
  p_expected_rev bigint,
  p_actor        text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid := public.st_workspace_id();
  v_current bigint;
  v_new     bigint;
begin
  if not public.is_workspace_member(v_id) then
    return jsonb_build_object('ok', false, 'error', 'Not a member of this workspace.');
  end if;

  select rev into v_current from public.workspaces where id = v_id for update;
  if v_current is null then
    return jsonb_build_object('ok', false, 'error', 'Workspace does not exist.');
  end if;

  if p_expected_rev is not null and p_expected_rev <> v_current then
    return jsonb_build_object('ok', false, 'conflict', true, 'rev', v_current);
  end if;

  update public.workspaces
     set state = p_state,
         rev = v_current + 1,
         updated_at = now(),
         updated_by = auth.uid(),
         updated_by_name = p_actor
   where id = v_id
   returning rev into v_new;

  return jsonb_build_object('ok', true, 'rev', v_new);
end;
$$;

-- ------------------------------------------------------------
-- workspace_head — cheap poll target (rev + who touched it last)
--
-- SECURITY DEFINER so the 3-minute poll is a single tiny call that does not
-- drag the whole state blob across the wire.
-- ------------------------------------------------------------
create or replace function public.workspace_head()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_id uuid := public.st_workspace_id();
  v_row public.workspaces;
begin
  if not public.is_workspace_member(v_id) then
    return jsonb_build_object('ok', false, 'error', 'Not a member of this workspace.');
  end if;
  select * into v_row from public.workspaces where id = v_id;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'Workspace does not exist.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'rev', v_row.rev,
    'updated_at', v_row.updated_at,
    'updated_by_name', v_row.updated_by_name,
    'is_self', v_row.updated_by = auth.uid()
  );
end;
$$;

-- ------------------------------------------------------------
-- Grants — RPCs are callable by any signed-in device account, but each one
-- enforces its own membership/credential check above.
-- ------------------------------------------------------------
grant execute on function public.bootstrap_workspace(text, jsonb)        to authenticated;
grant execute on function public.join_workspace(text, text, boolean)     to authenticated;
grant execute on function public.push_workspace(jsonb, bigint, text)     to authenticated;
grant execute on function public.workspace_head()                        to authenticated;
grant execute on function public.st_workspace_id()                       to authenticated;

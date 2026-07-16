-- SceneTrackable cloud sync schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

drop policy if exists "Users manage their own workspace" on public.workspaces;
create policy "Users manage their own workspace"
  on public.workspaces
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

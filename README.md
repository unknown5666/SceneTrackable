# SceneTrackable

AI script-breakdown platform for film & TV production. Upload a screenplay (PDF or paste), and SceneTrackable extracts every scene and production element — cast, extras, props, wardrobe, SFX, VFX, vehicles, animals, locations, makeup, stunts, and production requirements — into an editable breakdown, plus scheduling (strip board + DOOD), tasks, budget, department portals, and exportable reports.

Built by OverExposure Productions.

## Stack

Vite · React 18 · TypeScript · Tailwind · Zustand (persisted) · pdfjs-dist · Anthropic Claude (browser-direct) · Supabase (optional cloud sync)

## Run locally

```sh
npm install
npm run dev
```

First login: **Admin / 1234** (change it in Admin → Users; passwords are stored hashed).

Add an Anthropic API key in **AI Settings** for live scene analysis — without one the app runs in demo mode.

## Go live (free tier) — 5-minute checklist

### 1. Supabase (cloud sync — projects follow you across devices)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), run it.
3. Copy **Project Settings → API → Project URL** and **anon public key**.
4. Put them in `.env` (see `.env.example`) for local dev, and in your host's environment variables for production.

Cloud Sync then appears live under the admin sidebar: sign up, **Push** to upload the workspace, **Pull** on any other device, or enable **Auto-sync**.

### 2. Vercel (free hosting)

1. Push this repo to GitHub (create an empty repo, then `git remote add origin <url> && git push -u origin main`).
2. Create a free account at [vercel.com](https://vercel.com) → **Add New Project** → import the repo. Vercel auto-detects Vite; the included `vercel.json` handles SPA routing.
3. In **Project → Settings → Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Done — share the URL.

(Netlify works identically; add a `_redirects` file with `/* /index.html 200` instead of `vercel.json`.)

### Security notes

- The Anthropic API key lives in the admin's browser localStorage and calls the API directly from the browser. Don't share an admin browser session. For a hardened production setup, move AI calls behind a Supabase Edge Function later.
- In-app user passwords are SHA-256 hashed at rest. Cloud sync data is protected by Supabase row-level security (each account can only read/write its own workspace).

## Backups

Admin → Data → **Download backup** exports the whole workspace as JSON; **Restore backup** replaces it.

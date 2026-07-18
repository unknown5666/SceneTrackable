# SceneTrackable

AI script-breakdown platform for film & TV production. Upload a screenplay (PDF or paste), and SceneTrackable extracts every scene and production element — cast, extras, props, wardrobe, SFX, VFX, vehicles, animals, locations, makeup, stunts, and production requirements — into an editable breakdown, plus scheduling (strip board + DOOD), tasks, budget, department portals, and exportable reports.

Built by OverExposure Productions.

## Stack

Vite · React 18 · TypeScript · Tailwind · Zustand (persisted) · pdfjs-dist · Anthropic Claude or Google Gemini (browser-direct) · Supabase (optional cloud sync)

## Run locally

```sh
npm install
npm run dev
```

First login: **Admin / 1234** (change it in Admin → Users; passwords are stored hashed). Change it before enabling cloud sync — see [Security notes](#security-notes).

Add an API key in **AI Settings** for live scene analysis — without one the app runs in demo mode.

Two providers are supported, and picking a model picks its provider:

| Model | Provider | Key from | Notes |
| --- | --- | --- | --- |
| Opus 4.8 / Sonnet 5 / Haiku 4.5 | Anthropic | [console.anthropic.com](https://console.anthropic.com) | Paid; highest breakdown quality |
| Gemini 2.5 Flash / Flash Lite | Google | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | **Free tier** — good for dev & demos |
| Gemini 2.5 Pro | Google | same | Paid tier |

⚠️ Google's **free tier trains on your prompts**. Screenplays sent with a free-tier Gemini key are not confidential — use it for development and demos, and switch to a paid key (either provider) before running a client's script.

## Go live (free tier) — 5-minute checklist

### 1. Supabase (cloud sync — one shared workspace for the whole team)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), run it.
3. Go to **Authentication → Providers → Email** and turn **off** *Confirm email*. SceneTrackable creates each device's cloud account silently and can't click a confirmation link.
4. Copy **Project Settings → API → Project URL** and **anon public key**.
5. Put them in `.env` (see `.env.example`) for local dev, and in your host's environment variables for production.
6. Deploy, then **sign in as your admin immediately** — see the warning below.

There is no separate cloud login. Signing into SceneTrackable signs you into the cloud: the Supabase account is derived from your username and password, so everyone who signs in lands in the same shared workspace. Your edits upload ~8s after you stop typing, and the app checks for other people's changes every 3 minutes.

To add someone: **Admin → Users → Invite**, and give them the 8-character code. They open the URL from anywhere, pick their own password on the *Redeem invite* tab, and the workspace downloads to their device.

> ⚠️ **Claim the workspace before sharing the URL.** On a fresh deployment the first person to sign in becomes the workspace, and the seeded `Admin / 1234` is public knowledge. Sign in as your admin and change that password (Admin → Users) before anyone else has the link.

### 2. Vercel (free hosting)

1. Push this repo to GitHub (create an empty repo, then `git remote add origin <url> && git push -u origin main`).
2. Create a free account at [vercel.com](https://vercel.com) → **Add New Project** → import the repo. Vercel auto-detects Vite; the included `vercel.json` handles SPA routing.
3. In **Project → Settings → Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Done — share the URL.

(Netlify works identically; add a `_redirects` file with `/* /index.html 200` instead of `vercel.json`.)

### Security notes

- The AI API key lives in the admin's browser localStorage and calls the provider directly from the browser. Don't share an admin browser session. For a hardened production setup, move AI calls behind a Supabase Edge Function later.
- Free-tier Gemini keys let Google train on submitted screenplays. Don't use one for confidential material.
- In-app user passwords are SHA-256 hashed at rest. Cloud data is protected by Supabase row-level security: reads and writes require a row in `workspace_members`, and the only way onto that roster is the `join_workspace()` function, which re-checks your password hash or invite code against the workspace's own user list server-side. Signing up alone grants nothing.
- **Cloud access is only as strong as the SceneTrackable password**, because the device's Supabase credential is derived from it. Change `Admin / 1234` before going live, and don't hand out weak passwords.
- The shared workspace is exactly that — **shared**. Every member can read and write all of it. The role system controls what the UI offers, not what the cloud will accept, so only invite people you'd trust with the whole production.
- An admin password reset revokes the user's old cloud access when they redeem the new invite code — until they redeem, their old password still works. Deactivate the account instead if you need access cut immediately.

## Backups

Admin → Data → **Download backup** exports the whole workspace as JSON; **Restore backup** replaces it.

## v2 additions

- **Multi-location shoot days.** A day can span a company move; the strip board groups its scenes under per-location sub-headers, and scenes at a location the day doesn't cover show as **off-location** (badged, draggable, never hidden) rather than disappearing.
- **Equipment catalog.** "Add from catalog" on Camera and RF/Comms prefills records from an industry-standard set (ARRI/RED/Sony/Canon/Blackmagic/Panasonic bodies, Sennheiser/Shure/Lectrosonics/Teradek/Hollyland/Eartec) with inline SVG illustrations. Records carry a `presetId` only; illustrations are drawn, not stored.
- **Drones tab.** DJI-led presets with weight and camera specs, operator/licence/day-rate tracking, day booking, and a one-click **Send to budget** (Camera · Aerial).
- **Media fields.** `url` and `image` field types (URL-first, uploads downscaled to a ≤50 KB JPEG data-URI), with `ImageThumb`, `MapEmbed`, and a gender-tinted cast avatar.
- **Resilient AI.** Long runs report to a store-level job registry so a slim TopBar pill shows progress from any page and navigation never cancels a run; a free-tier request meter and 1113 allowance-paused UX are on AI Settings. New GLM-flash features: prop/wardrobe suggestions (Art), location scout brief (Locations), DOOD draft and printable call sheet (Schedule).

### Future / TODO (v2 §F extras not yet built)

- Insertable meal / company-move banner **strips** between scenes on a day (auto company-move dividers exist; manual meal breaks don't yet).
- Day-strip colouring by the full industry INT/EXT + time convention (white / yellow / blue / green).
- Equipment **checkout linkage** — checkout entries referencing catalog records by `presetId`.
- One-line schedule PDF via the printable-sheet path (call-sheet PDF is done).

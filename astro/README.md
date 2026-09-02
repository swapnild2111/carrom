# Carrom Thane — Astro app

Astro static site (Svelte islands) backed by Firestore + Firebase Auth. Deployed to Firebase Hosting.

**Live**: https://carrom-thane.web.app/

For a high-level overview see the [root README](../README.md). This document covers local development, credentials, and deploys.

## Prerequisites

- Node 20+
- Python 3.12+ (only for the backup script)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools` → `firebase login`
- A service-account JSON for the `carrom-thane` Firebase project, kept outside the repo (see [Credentials](#credentials))

## Install

```bash
cd astro
npm install
```

## Credentials

`npm run build` reads Firestore at build time via the Firebase Admin SDK, which needs a service-account key:

1. Open the [Firebase service accounts settings](https://console.firebase.google.com/project/carrom-thane/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key** — a JSON downloads
3. Move it outside the repo and lock it down:
   ```bash
   mv ~/Downloads/carrom-thane-*.json ~/.config/carrom-thane-admin.json
   chmod 600 ~/.config/carrom-thane-admin.json
   ```
4. Copy `astro/.env.example` to `astro/.env` and set the path:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/Users/YOU/.config/carrom-thane-admin.json
   ```

`.gitignore` blocks `*firebase-adminsdk*.json` and `.env`. Without credentials, `npm run build` still succeeds but pages ship with empty tables.

## Local development

```bash
cd astro
npm run dev
```

Open http://localhost:4323/. The dev server talks directly to the live `carrom-thane` Firestore project — no emulator needed.

### A note on the dev port

`astro.config.mjs` pins the dev server to port **4323** because port 4321 is used by a separate project on this machine.

## Deploying

Push to `main` → `.github/workflows/deploy.yml` builds the site with current Firestore data and deploys to the Firebase Hosting live channel at `carrom-thane.web.app`.

For a manual deploy from a workstation:

```bash
cd astro
GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json npm run build
firebase deploy --project carrom-thane
```

## How data gets into pages

Every read page is **pre-rendered at build time** — the Astro build fetches Firestore via the Firebase Admin SDK and bakes the data into HTML. First paint is instant with no client-side loading state.

Data edits are written directly to Firestore and appear on the public site after the next build+deploy. The gold **"Publish now ↗"** button in the admin topbar triggers a rebuild on demand.

## Project layout

```
astro/
  src/
    pages/                    Static routes
      index.astro             Home (leaderboard + charts)
      admin.astro             Admin surface (auth-gated)
      players/[id].astro      Per-player detail page
      clubs/index.astro       Club grid
      clubs/[id].astro        Per-club roster
      awards/index.astro      Redirects to current season
      awards/[year].astro     Per-season awards page
    components/
      layout/                 Header, footer, season picker
      home/HomeDashboard.svelte
      player/PlayerDetail.svelte
      club/ClubList.svelte, ClubDetail.svelte
      awards/AwardsPage.svelte, AwardsIndex.svelte
      admin/AdminApp.svelte, ManageModal.svelte
      auth/AdminGate.svelte, SignIn.svelte
    lib/
      firebase.ts             Client Firebase SDK init
      firestore-server.ts     Build-time Firestore reads (Admin SDK)
      firestore-reads.ts      Client Firestore reads + derivations
      firestore-writes.ts     Client mutations with audit stamping
      firestore-schema.ts     TypeScript types for every doc shape
      auth.ts                 Auth wrapper
    styles/
      global.css              Site-wide styles
  public/                     Static assets (logo, favicon)
  firebase.json               Hosting + Firestore config
  firestore.rules             Security rules
  firestore.indexes.json      Composite indexes
  astro.config.mjs            Astro config (Svelte, port 4323)
```

## Firestore security rules

Rules live in [`firestore.rules`](firestore.rules). After editing:

```bash
cd astro
firebase deploy --only firestore:rules --project carrom-thane
```

Rule changes are immediate — no site rebuild required.

## Manual Firestore backup

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
python scripts/export_firestore_backup.py --project carrom-thane \
    --output backups/$(date -u +%Y-%m-%d).json.gz
```

Nightly backups also run automatically — see [`.github/workflows/firestore-backup.yml`](../.github/workflows/firestore-backup.yml).

# Carrom Thane — Astro app

Astro static site (Svelte islands) backed by Firestore + Firebase Auth. Deployed to Firebase Hosting.

**Live**: https://carrom-thane.web.app/

For a high-level overview see the [root README](../README.md). This document covers local development, credentials, and deploys.

## Prerequisites

- Node 20+
- Python 3.12+ (only if you run the backup or admin-provisioning scripts)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools` → `firebase login`
- A service-account JSON for the `carrom-thane` Firebase project, kept outside the repo (see [Credentials](#credentials))

## Install

```bash
cd astro
npm install
```

## Credentials

Both `npm run build` and the admin Python scripts read Firestore via the Firebase Admin SDK, which needs a service-account key. Get one once:

1. Open the [Firebase service accounts settings](https://console.firebase.google.com/project/carrom-thane/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key** — a JSON downloads
3. Move it outside the repo, e.g. `~/.config/carrom-thane-admin.json`, and set permissions:
   ```bash
   chmod 600 ~/.config/carrom-thane-admin.json
   ```
4. Copy `astro/.env.example` to `astro/.env` and set the path:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/Users/YOU/.config/carrom-thane-admin.json
   ```

`.gitignore` blocks `*firebase-adminsdk*.json` and `.env` as a safety net, but the JSON should live **outside** the repo regardless. Without credentials, `npm run build` still succeeds but pages ship with empty tables — a warning is printed in the build log.

## Local development

```bash
cd astro
npm run dev
```

Open http://localhost:4323/.

The dev server does NOT need the emulator — it talks to the real `carrom-thane` Firestore project. Public reads work anonymously; writes need Google sign-in at `/admin/`. The Astro dev command re-runs the page frontmatter (which fetches Firestore) on every request, so it's slower than a production build — for a Hugo-fast experience use:

```bash
npm run build && npm run preview -- --port 4324
```

Then visit http://localhost:4324/.

### A note on the dev port

`astro.config.mjs` pins the dev server to port **4323** (not Astro's default 4321) because port 4321 collides with a separate project on this machine.

## Deploying

Push to `main` and `.github/workflows/deploy.yml` builds the site (with Firestore data baked in) and deploys to the Firebase Hosting live channel at `carrom-thane.web.app`.

For a manual deploy from your workstation:

```bash
cd astro
GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json npm run build
firebase deploy --project carrom-thane
```

## How data gets into pages

Every read page (home, player detail, club detail, awards) is **pre-rendered at build time** — the Astro build fetches Firestore via the Firebase Admin SDK and bakes the data into HTML. First paint is instant with no client-side Firestore fetch. Astro's `<ClientRouter />` view transitions keep the header/nav/picker locked in place across navigations; only the main content region crossfades.

**Admin edits go directly to Firestore** and land in ~1 second. Because the public pages are pre-rendered, edits appear on the public site on the next deploy — which happens automatically:

- After every successful admin write, the client sets `/system/publish_status.dirty = true` in Firestore.
- `.github/workflows/auto-publish.yml` runs every 5 minutes. When it sees the dirty flag it rebuilds, deploys to the live channel, and clears the flag.
- Public visitors see admin changes within **~5 minutes** with no manual step.

An admin can also trigger an immediate publish by running `gh workflow run "Auto-publish on admin edits" -R swapnild2111/carrom` (or clicking Run workflow from the Actions tab).

The Astro build reads Firestore server-side via the Admin SDK, so security rules are irrelevant to the build path — the SDK bypasses them. All security is enforced on client-side writes (auth token verification + rule evaluation) and public reads (rules allow everyone to read data collections).

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
      firestore-reads.ts      Client Firestore reads + derivations (leaderboard, ranks)
      firestore-writes.ts     Client mutations with audit stamping
      firestore-schema.ts     TypeScript types for every doc shape
      auth.ts                 Auth wrapper + pending-admin auto-promote
    styles/
      global.css              Site-wide styles (dark theme)
  public/                     Static assets (logo, favicon)
  firebase.json               Hosting + Firestore config
  firestore.rules             Security rules (deploy with `firebase deploy --only firestore:rules`)
  firestore.indexes.json      Composite indexes
  astro.config.mjs            Astro config (Svelte, port 4323)
```

## Admin operations

### Add a new admin

```bash
cd ..                                       # repo root
source .venv/bin/activate 2>/dev/null || true
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
python scripts/add_pending_admin.py --project carrom-thane \
    new-admin@example.com \
    --role owner \
    --display-name "Full Name"
```

The next time that person signs in at `/admin/`, the client detects their pending record, creates `/admins/{uid}` with the queued role, and deletes the pending entry.

### Set an awards ceremony video

```bash
python scripts/set_season_ceremony_url.py --project carrom-thane \
    2024 https://www.youtube.com/watch?v=xxxxxxxx
```

Then trigger a rebuild for the change to show on the public site.

### Manual Firestore backup

```bash
python scripts/export_firestore_backup.py --project carrom-thane \
    --output backups/$(date -u +%Y-%m-%d).json.gz
```

Nightly backups also run automatically — see [`.github/workflows/firestore-backup.yml`](../.github/workflows/firestore-backup.yml).

## Deploying Firestore security rules

Rules live in [`firestore.rules`](firestore.rules). After editing:

```bash
cd astro
firebase deploy --only firestore:rules --project carrom-thane
```

The deploy is separate from Hosting so rule changes are immediate — no full site rebuild required.

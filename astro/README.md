# Carrom Thane — Astro + Firebase (PR 1)

Astro replaces Hugo. Firestore replaces `data/*.json`. Firebase Auth replaces GitHub PATs. Firebase Hosting replaces GitHub Pages.

This subdir lives **alongside** the current Hugo project during migration. The live GitHub Pages site keeps running unchanged. Once PR 3 lands we delete Hugo.

## What's in PR 1

- Astro project scaffolded with Svelte islands
- Firebase config: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc`
- Client-side Firebase SDK init (`src/lib/firebase.ts`)
- TypeScript types + Firestore read helpers ported from `scripts/build_derived.py`
- Migration script (`scripts/migrate_json_to_firestore.py`) that seeds Firestore from current `data/*.json`
- Home page (`src/pages/index.astro`) — all-time strip, trophy race, season stat cards, leaderboard — hydrated live from Firestore
- Preview deploy workflow (`.github/workflows/deploy-firebase-preview.yml`)

## What's NOT in PR 1

- Admin auth + write path (PR 2)
- Player detail, club detail, awards pages (PR 2/3)
- Cutover of the production DNS (PR 3)
- Deletion of Hugo tree + `*_from_issue.py` scripts (PR 3)

---

## Local dev — first-time setup

You need Node 20+, Python 3.12+, and the Firebase CLI.

### 1. Install prerequisites

```bash
# One-time
npm install -g firebase-tools

# In the astro/ subdir
cd astro
npm install
```

### 2. Sign in to Firebase (opens a browser)

```bash
firebase login
```

Use the Google account that owns the `carrom-thane` Firebase project.

### 3. Install Python deps for the migration script

```bash
cd ..                     # back to repo root
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

`firebase-admin` was added — that's the SDK the migration script uses.

---

## Two ways to run the site locally

### Option A: Astro dev server against the Firebase emulator (recommended)

Fully offline development. No cost. No risk of touching prod.

```bash
# Terminal 1 — start emulator suite (Firestore on :8080, Auth on :9099, UI on :4000)
cd astro
firebase emulators:start

# Terminal 2 — seed the emulator with current JSON data
cd ..
source .venv/bin/activate
FIRESTORE_EMULATOR_HOST=localhost:8080 \
  python scripts/migrate_json_to_firestore.py --project demo-carrom

# Terminal 3 — start Astro dev server
cd astro
npm run dev
```

Open http://localhost:4321 (or 4322 if 4321's busy).

The Firebase client SDK **auto-detects** localhost and connects to the emulator on port 8080 — no config change needed. See `src/lib/firebase.ts:shouldUseEmulator()`.

The emulator UI at http://localhost:4000 lets you inspect Firestore collections and Auth users.

### Option B: Astro dev server against the real Firebase project

Only for verifying real production data. Won't work until Firestore has been seeded (Step 3 below).

```bash
cd astro
npm run dev
```

Open http://localhost:4321. Client SDK will connect to Firestore in the `carrom-thane` project. Reads work; writes fail (nothing is signed in yet).

---

## Seeding the real Firestore project (once)

Do this **once** to move current data from `data/*.json` into Firestore.

### 1. Grant your local machine credentials to write to the project

```bash
gcloud auth application-default login
```

This opens a browser and stores a token at `~/.config/gcloud/application_default_credentials.json`. The `firebase-admin` SDK picks it up automatically.

If you don't have `gcloud`, install it from https://cloud.google.com/sdk/docs/install or use a service-account JSON instead.

### 2. Dry-run first (no writes)

```bash
source .venv/bin/activate
python scripts/migrate_json_to_firestore.py --project carrom-thane --dry-run
```

Expected output:
```
→ Real project mode (carrom-thane). Using Application Default Credentials.
→ Dry run — no writes will be made.
  players: 56 rows
  clubs: 4 rows
  slams: 180 rows
  seasons: 3 rows
  pending_admins: 2 usernames
```

### 3. Real migration

```bash
python scripts/migrate_json_to_firestore.py --project carrom-thane
```

Expected: 5 collections written, ~245 documents total. Idempotent — running twice is safe.

### 4. Verify in the console

Open https://console.firebase.google.com/project/carrom-thane/firestore → you should see collections: `players`, `clubs`, `slams`, `seasons`, `pending_admins`. Click into `players/kunal-raut` to spot-check the doc shape.

---

## Deploying the Astro preview

The preview channel lives at `https://carrom-thane--astro-preview-<hash>.web.app` — separate from the eventual production `carrom-thane.web.app`. Deploy is triggered by any push under `astro/**` on the `main` branch (after the workflow is set up).

### One-time setup for the workflow

The GitHub Action needs a service-account JSON to auth into Firebase Hosting.

1. In the Firebase console → ⚙ **Project settings** → **Service accounts** → click **"Generate new private key"**. A JSON downloads.
2. In GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT_CARROM_THANE`
   - Value: paste the entire contents of the JSON file
3. Save.

Next push to `astro/**` on main will build + deploy. The workflow comments the preview URL on the commit.

### Manual deploy (skip GitHub Action)

```bash
cd astro
npm run build
firebase hosting:channel:deploy astro-preview --expires 30d
```

Firebase CLI prints the preview URL.

---

## Verifying end-to-end

1. Emulator seeded with real JSON: `python scripts/migrate_json_to_firestore.py --project demo-carrom` after `firebase emulators:start`.
2. Astro dev server up on `npm run dev`.
3. Open `http://localhost:4321` — you should see the all-time strip with Kunal Raut 29, trophy race with Kunal + Babu Bhai, leaderboard populated.
4. Switch the season dropdown to 2024-25 → data reflects that season. To 2026-27 → empty state.
5. All timing under 1 second (local emulator).

Then repeat against the real project (`carrom-thane`) at the preview URL.

---

## What's next (PR 2)

Firebase Auth admin sign-in + Svelte drawer that writes directly to Firestore. Deletes all `*_from_issue.py` scripts, `process-*.yml` workflows, admin issue templates. That's the moment latency drops from ~2min to <1s.

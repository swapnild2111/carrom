<div align="center">

<h1>Thane Carrom Slams</h1>

<p><strong>Player profiles, club records, live leaderboard, and season awards for Thane District carrom.</strong></p>

<p>
  <a href="https://carrom-thane.web.app/"><img src="https://img.shields.io/badge/Live-Firebase%20Hosting-ffca28?style=plastic&logo=firebase&logoColor=white" alt="Live" /></a>
  <img src="https://img.shields.io/badge/Framework-Astro%20%2B%20Svelte-ff5d01?style=plastic&logo=astro&logoColor=white" alt="Astro" />
  <img src="https://img.shields.io/badge/Data-Firestore-039be5?style=plastic&logo=firebase&logoColor=white" alt="Firestore" />
</p>

</div>

## About

Public tracker for the Thane District carrom community — leaderboard, per-player profiles, per-club rosters, and season awards. Admins log slams as they're played; the site updates within a few seconds of a `firebase deploy` and always reflects the latest Firestore data at build time.

**Live**: https://carrom-thane.web.app/

## Architecture

- **[Astro](https://astro.build)** static site with **Svelte** islands for interactive pieces (season picker, admin drawer, charts)
- **[Firestore](https://firebase.google.com/docs/firestore)** as source of truth (players, clubs, slams, seasons, admins, audit log)
- **[Firebase Auth](https://firebase.google.com/docs/auth)** for admin sign-in — Google popup or email magic-link
- **[Firebase Hosting](https://firebase.google.com/docs/hosting)** serves the pre-rendered site at `carrom-thane.web.app`
- **Chart.js** for the home page visualizations, code-split so first paint stays fast
- Every read page is **pre-rendered at build time** — the Astro build fetches Firestore via the Admin SDK and bakes the data into HTML. First paint is instant; admin edits appear on the public site on the next deploy.

Full local-dev / deploy details: [`astro/README.md`](astro/README.md).

## Repo layout

```
astro/                    Astro + Svelte app (all frontend + Firestore rules)
  src/
    pages/                Home, admin, player detail, club detail, awards
    components/           Layout + admin + charts (islands)
    lib/                  Firestore reads/writes, auth wrapper, TS schema
  firestore.rules         Security rules (deploy with `firebase deploy --only firestore:rules`)
  firebase.json           Hosting + Firestore config
  package.json            Astro, Svelte, Firebase SDK, Chart.js
scripts/                  Admin helpers (Python + Firebase Admin SDK)
  seed_admin.py           Seed first admin after they've signed in
  add_pending_admin.py    Queue admin by email — auto-promotes on their first sign-in
  set_season_ceremony_url.py  Attach a YouTube URL to a season's awards page
  export_firestore_backup.py  Dumps all collections to a gzipped JSON file
.github/workflows/
  deploy.yml              Build Astro + deploy to Firebase Hosting live channel on push
  firestore-backup.yml    Nightly backup to the `backups` branch
```

## Admin workflow

Admins visit `/admin/`, sign in with Google, and edit through the drawer:

- Slam +1 / +5 / −1 accumulate as **pending** deltas — nothing writes until you click Save
- Save closes the drawer and applies the batch to Firestore in one round-trip
- Every write stamps `createdBy` / `updatedBy` = signed-in UID (enforced by security rules) and appends an entry to `/audit_log`
- Recent activity is visible in the bell icon at the top of the admin surface

An owner can add another admin by email — see the section below.

## Adding a new admin

The queued email must match the account the target admin will sign in with.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
python scripts/add_pending_admin.py --project carrom-thane \
    new-admin@example.com \
    --role owner \
    --display-name "Full Name"
```

The next time that person signs in at `/admin/`, the client detects their pending record, creates `/admins/{uid}` with the queued role, and deletes the pending entry. Reload — they now have admin access.

`--role editor` limits them to editing data (players, clubs, slams, seasons). `--role owner` also lets them add or remove other admins.

## Deploying

Push to `main` and the `Deploy Astro to Firebase Hosting` workflow builds the site (fetching current Firestore data) and publishes to https://carrom-thane.web.app.

Manual deploy from local machine (uses your Firebase CLI login):

```bash
cd astro
GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json npm run build
firebase deploy --project carrom-thane
```

## Backups

`.github/workflows/firestore-backup.yml` runs nightly at 21:00 UTC. It dumps every collection to a gzipped JSON file and commits to the `backups` branch. The branch keeps ~30 days of history. Manual on-demand backup:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
python scripts/export_firestore_backup.py --project carrom-thane \
    --output backups/$(date -u +%Y-%m-%d).json.gz
```

## License

MIT — see [`LICENSE`](LICENSE).

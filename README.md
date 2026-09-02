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

Public tracker for the Thane District carrom community — leaderboard, per-player profiles, per-club rosters, and season awards.

**Live**: https://carrom-thane.web.app/

## Architecture

- **[Astro](https://astro.build)** static site with **Svelte** islands for interactive pieces (season picker, charts, admin surface)
- **[Firestore](https://firebase.google.com/docs/firestore)** as the data store (players, clubs, slams, seasons)
- **[Firebase Auth](https://firebase.google.com/docs/auth)** for sign-in — Google account only
- **[Firebase Hosting](https://firebase.google.com/docs/hosting)** serves the site at `carrom-thane.web.app`
- Every read page is **pre-rendered at build time** — Firestore data is baked into HTML at deploy time; first paint is instant with no client-side loading state

Full local-dev and deploy details: [`astro/README.md`](astro/README.md).

## Repo layout

```
astro/                    Astro + Svelte app
  src/
    pages/                Home, player detail, club detail, awards, admin
    components/           Layout, charts, admin surface
    lib/                  Firestore reads/writes, auth, schema
  firestore.rules         Security rules
  firebase.json           Hosting config
scripts/                  Maintenance helpers (Python + Firebase Admin SDK)
.github/workflows/
  deploy.yml              Build + deploy to Firebase Hosting on push to main
  firestore-backup.yml    Nightly Firestore backup to the backups branch
```

## Deploying

Any push to `main` triggers `.github/workflows/deploy.yml`, which builds the Astro site with current Firestore data and deploys to `carrom-thane.web.app`.

After data edits, click the gold **"Publish now ↗"** button in the admin topbar to trigger a rebuild on demand (~1 min).

Manual deploy from a workstation:

```bash
cd astro
GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json npm run build
firebase deploy --project carrom-thane
```

## Backups

`.github/workflows/firestore-backup.yml` runs nightly at 21:00 UTC, dumping all collections to a gzipped JSON file committed to the `backups` branch (~30 days of history).

## License

MIT — see [`LICENSE`](LICENSE).

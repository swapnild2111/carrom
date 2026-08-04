<div align="center">

<h1>🎯 Thane Carrom Slams</h1>

<p><strong>A free, open-source slam tracker for Thane District — player profiles, club records, live leaderboard, season awards, and cross-season records.</strong></p>

<p>

[![Live](https://img.shields.io/badge/Live-GitHub%20Pages-4f8ef7?style=plastic&logo=githubpages&logoColor=white)](https://swapnild2111.github.io/carrom/)
[![Seasons](https://img.shields.io/badge/Seasons-2024%E2%80%9325%20%C2%B7%202025%E2%80%9326%20%C2%B7%202026%E2%80%9327-e8c547?style=plastic&logoColor=1a1408)](https://swapnild2111.github.io/carrom/)
[![District](https://img.shields.io/badge/District-Thane-a78bfa?style=plastic&logo=googlemaps&logoColor=white)](https://swapnild2111.github.io/carrom/)
[![License](https://img.shields.io/badge/License-MIT-4ade80?style=plastic&logo=opensourceinitiative&logoColor=white)](LICENSE)

<br>

[![Players](https://img.shields.io/badge/Players-56-4a9eff?style=plastic)](https://swapnild2111.github.io/carrom/)
[![Slams](https://img.shields.io/badge/Slams-180-e8c547?style=plastic)](https://swapnild2111.github.io/carrom/)
[![Hugo](https://img.shields.io/badge/Hugo-Extended-ff4088?style=plastic&logo=hugo&logoColor=white)](https://gohugo.io/)
[![Python](https://img.shields.io/badge/Python-3.12-3776ab?style=plastic&logo=python&logoColor=white)](#for-developers)
[![Tests](https://img.shields.io/badge/Tests-pytest%20E2E-0A9EDC?style=plastic&logo=pytest&logoColor=white)](docs/testing.md)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=plastic&logo=githubactions&logoColor=white)](.github/workflows/test.yml)

</p>

<p><a href="https://swapnild2111.github.io/carrom/"><strong>👉 Open the tracker</strong></a></p>

</div>

---

## What's inside

Every white and black slam for Thane players — logged, ranked, and celebrated across fiscal-year seasons (April → March). Browse the all-time hall of fame, drill into any player's history, switch between seasons, watch the awards ceremony. No account needed to read; allowlisted editors update data through the admin panel.

| Section | What's there | What you do |
|---------|--------------|-------------|
| 🏠 **Home** | All-time leaders strip, season leaderboard beside top-10 chart, W/B doughnut, podium radar, slams-by-club bar, season-over-season trend line | See who's leading now, who's leading ever, at a glance |
| 👤 **Players** | Profile per player — stats, slam-mix chart, timeline, standing vs leader (season-aware via `?season=YYYY`) | Click any name on the leaderboard |
| 🏛️ **Clubs** | Club roster and slams logged through each club | Browse from `/clubs/` |
| 🏆 **Awards** | Max white & max black slam leaders per season, ceremony video, top-five race | One awards page per season |
| ⚙️ **Admin** | Player-first drawer + Manage modal for allowlisted editors | Search players, edit inline, batch changes, one-click save |

---

## Why this exists

Thane has a vibrant carrom scene — clubs, tournaments, YouTube slams — but no single place tracked **who slammed how many times** across the district. Spreadsheets drift; WhatsApp threads lose context. **This site doesn't.**

- 🆓 **Completely free** — no ads, no subscriptions, no premium tier
- 🔐 **No account to browse** — open the site, read the leaderboard, leave whenever
- 📊 **Totals are computed** — edit individual slam events, never hand-maintained counts
- 🔎 **Every slam is auditable** — admin changes flow through GitHub Issues → validated commits
- 📱 **Works on your phone** — dark theme, charts, searchable player index
- ⚡ **Static & fast** — Hugo on GitHub Pages; no database server to babysit

It started as a season tracker for **Team Carrom and Flute**. It grew into a full portal because players wanted profiles, clubs wanted credit, and the district wanted a proper awards page.

---

## Standout features

### 🏆 Hall of Fame band + season-aware dashboard

A gold-tinted strip at the top of the home page celebrates all-time record holders across every season. Below it, the season dropdown in the header scopes everything to a chosen fiscal year — leaderboard, charts, awards preview all swap client-side.

### 📈 Five live charts on the home page

Top-10 stacked bar (leaderboard side-by-side), white/black doughnut, top-three radar, slams-by-club horizontal bar, and a season-over-season trend line. All rendered from `slams.json` at build time; nothing painted by hand.

### 👤 Rich player profiles

SoL-style hero, stat cards, slam-mix chart, standing vs leader, and a grouped slam timeline. Identical club slams without extra detail collapse into one row so the log stays readable. Switch seasons via `?season=YYYY` to see any historical breakdown.

### 🏆 Awards page per season

Category winners (max white / max black) both get **gold** treatment — slam type is a secondary accent, not a fake silver-vs-gold ranking. The top-five race uses gold, silver, and bronze for positions 1–3. New awards pages are auto-generated whenever a new season is added.

### ⚙️ Player-first admin with optimistic UI

No database admin UI on a server. The admin panel opens on a searchable list of players. Click any player → right-side drawer with editable profile, multi-select club combobox, big White/Black count cards with `+1 / +5 / −1` buttons. Changes queue up locally — one **Save changes** click flushes them all as GitHub Issues in the background. Adding clubs, seasons, and new players lives inside a **Manage** modal so the top surface stays clean.

### 🧪 Full test pack

Every admin workflow has an E2E test (`python3 -m pytest`) that runs issue scripts against fixture data, then validates and rebuilds. See [docs/testing.md](docs/testing.md).

---

## Quick start

### Use it (just open the link)

👉 **https://swapnild2111.github.io/carrom/**

That's it. Bookmark the home page, tap a player, check awards — no signup, no app store.

### Run it locally

```bash
git clone https://github.com/swapnild2111/carrom.git
cd carrom

python3 -m venv .venv && source .venv/bin/activate
pip3 install -r scripts/requirements.txt

python3 scripts/build_derived.py   # required before first hugo run
hugo server -D
# → http://localhost:1313/  (dev baseURL — no /carrom/ prefix)
```

Production uses the `/carrom/` base path: `https://swapnild2111.github.io/carrom/`

```bash
hugo --minify   # output to ./public/
```

### Run tests

```bash
pip3 install -r scripts/requirements.txt
python3 -m pytest tests/ -v
```

---

## Share it

If your club or district runs a slam season, share the link — that's the growth channel:

- Live URL: **https://swapnild2111.github.io/carrom/**
- Send players their profile link: `…/players/kunal-raut/`
- Awards night? Open **https://swapnild2111.github.io/carrom/awards/2024/** on the big screen (season 2024–25)

---

## Contribute

Pull requests are welcome. Some ideas:

- **Data corrections** — use the [admin panel](docs/admin.md) if you're allowlisted, or open an issue with the player/slam ID
- **Bug reports & UX feedback** — open an issue with a screenshot and browser
- **Another district** — fork, adapt `data/` and `config.toml`; the pipeline is mostly district-agnostic
- **Tests** — extend `tests/fixtures/issues/` when you add admin workflows

Before a code PR, run:

```bash
python3 scripts/validate_schema.py
python3 -m pytest tests/ -v
```

---

## For developers

> Skip this section if you're just here to follow the leaderboard.

### Data model

Source of truth (edited only via admin / GitHub Issues):

| File | Purpose |
|------|---------|
| `data/players.json` | Player profiles (Thane district) |
| `data/clubs.json` | Club entities |
| `data/slams.json` | One row per slam event, `aggregate: true` marks placeholder rows safe to remove on bulk-shrink |
| `data/seasons.json` | Fiscal-year seasons (April → March), keyed by starting year |
| `data/admin-allowlist.json` | GitHub logins allowed to submit admin changes |

Generated at build (`python3 scripts/build_derived.py`):

| Output | Purpose |
|--------|---------|
| `data/generated/site_summary.json` | Landing season resolver, per-season totals, all-time leaders |
| `data/generated/leaderboard-YYYY.json` | Per-season ranked player list |
| `data/generated/awards-YYYY.json` | Per-season white/black leaders |
| `data/generated/players_enriched-YYYY.json` | Per-season stats + timelines for player pages |
| `data/generated/clubs_enriched-YYYY.json` | Per-season roster + slam counts per club |
| `data/generated/all_time_leaders.json` | Cross-season records (Hall of Fame band) |
| `content/players/`, `content/clubs/`, `content/awards/` | Hugo pages (regenerated each build) |
| `static/data/*.json` | Copies for admin panel fetches + static serving |

Totals and ranks are **computed** from `slams.json`, never hand-edited.

### Repository layout

```
carrom/
├── README.md
├── LICENSE
├── config.toml              # Hugo site config + admin repo name
├── data/                    # source JSON (players, clubs, slams, seasons)
├── data/generated/          # per-season leaderboards, awards, enriched views
├── content/                 # Hugo pages (players/clubs/awards rebuilt by script)
├── layouts/                 # templates (home dashboard, player, club, awards, admin drawer)
├── static/css|js/           # theme, charts, admin panel
├── scripts/                 # build, validate, issue handlers, migrations
├── tests/                   # pytest E2E test pack
├── docs/                    # admin guide, testing docs
└── .github/
    ├── workflows/           # deploy, validate, process-*, test
    └── ISSUE_TEMPLATE/      # GitHub issue forms
```

### Admin pipeline

```
/admin/ form → GitHub Issue (label) → process-*.yml → *_from_issue.py
  → validate_schema.py → build_derived.py → commit main → deploy.yml
```

| Label | Script | Purpose |
|-------|--------|---------|
| `add-player` | `add_player_from_issue.py` | Register a new Thane player |
| `edit-player` | `edit_player_from_issue.py` | Update name / gender / aliases / clubs, or deactivate |
| `add-club` | `add_club_from_issue.py` | Register a new club |
| `edit-club` | `edit_club_from_issue.py` | Rename / update contact / deactivate |
| `add-slam` | `add_slam_from_issue.py` | Log one slam event with optional detail |
| `bulk-add-slam` | `bulk_add_slams_from_issue.py` | Append N aggregate slams in one submission (drawer +1/+5) |
| `edit-slam` | `edit_slam_from_issue.py` | Update fields or soft-delete a slam |
| `add-season` | `add_season_from_issue.py` | Register a new fiscal season (Apr→Mar) |
| `edit-season` | `edit_season_from_issue.py` | Update dates / label / visibility |

📖 Full operator guide: [docs/admin.md](docs/admin.md)

### Bootstrap + one-off migrations

- `scripts/import_total_slam.py` — reads `Carrom_records.xlsx` (gitignored) for initial migration. Preview by default; pass `--apply` to overwrite source JSON. Not wired to CI.
- `scripts/migrate_seasons_to_fiscal.py` — one-shot migration from calendar-year to fiscal-year seasons (kept for audit).
- `scripts/migrate_aggregate_flag.py` — one-shot backfill of the `aggregate` flag on legacy slam rows (kept for audit).

### Local dev prerequisites

```bash
# macOS
brew install hugo git
```

Hugo **Extended** is required if you add SCSS pipelines later; the current theme uses plain CSS in `static/css/`.

---

## License

**MIT** — see [LICENSE](LICENSE). Code (Hugo templates, CSS, JavaScript, Python scripts, and site configuration) is free to use, fork, and modify.

Player and club records are contributed by the Thane carrom community for public leaderboard use.

Built by [Swapnil Deshpande](https://github.com/swapnild2111). Tracking by **Team Carrom and Flute**. Contributions welcome.

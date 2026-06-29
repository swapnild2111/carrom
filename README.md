<div align="center">

<h1>🎯 Thane Carrom Slams</h1>

<p><strong>A free, open-source slam tracker for Thane District — player profiles, club records, live leaderboard, and season awards.</strong></p>

<p>

[![Live](https://img.shields.io/badge/Live-GitHub%20Pages-4f8ef7?style=plastic&logo=githubpages&logoColor=white)](https://swapnild2111.github.io/carrom/)
[![Season](https://img.shields.io/badge/Season-2025-e8c547?style=plastic&logoColor=1a1408)](https://swapnild2111.github.io/carrom/awards/2025/)
[![District](https://img.shields.io/badge/District-Thane-a78bfa?style=plastic&logo=googlemaps&logoColor=white)](https://swapnild2111.github.io/carrom/)
[![License](https://img.shields.io/badge/License-MIT-4ade80?style=plastic&logo=opensourceinitiative&logoColor=white)](LICENSE)

<br>

[![Players](https://img.shields.io/badge/Players-49-4a9eff?style=plastic)](https://swapnild2111.github.io/carrom/)
[![Slams](https://img.shields.io/badge/Slams-174-e8c547?style=plastic)](https://swapnild2111.github.io/carrom/)
[![Hugo](https://img.shields.io/badge/Hugo-Extended-ff4088?style=plastic&logo=hugo&logoColor=white)](https://gohugo.io/)
[![Python](https://img.shields.io/badge/Python-3.12-3776ab?style=plastic&logo=python&logoColor=white)](#for-developers)
[![Tests](https://img.shields.io/badge/Tests-pytest%20E2E-0A9EDC?style=plastic&logo=pytest&logoColor=white)](docs/testing.md)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=plastic&logo=githubactions&logoColor=white)](.github/workflows/test.yml)

</p>

<p><a href="https://swapnild2111.github.io/carrom/"><strong>👉 Open the tracker</strong></a></p>

</div>

---

## What's inside

The **2025 Thane season** — every white and black slam logged, ranked, and celebrated. Browse who's leading, drill into any player's history, see which club logged what, and watch the award ceremony. No account needed to read; allowlisted editors can update data through the admin panel.

| Section | What's there | What you do |
|---------|--------------|-------------|
| 🏠 **Home** | Live leaderboard, top-10 chart, white/black mix, podium radar | See who's leading the season at a glance |
| 👤 **Players** | Profile per player — stats, slam-mix chart, timeline, gap to leader | Click any name on the leaderboard |
| 🏛️ **Clubs** | Club roster and slams logged through each club | Browse from `/clubs/` |
| 🏆 **Awards** | Max white & max black slam leaders, ceremony video, top-five race | Gold/silver/bronze styling for podium positions |
| ⚙️ **Admin** | Web forms for allowlisted editors | Add or edit players, clubs, and slams via GitHub Issues |

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

### 📈 Live charts on the home page

Top-10 bar chart, white/black doughnut, and a podium radar for the top three — all driven from `slams.json` at build time. Refresh the deploy and the charts update; nothing is painted by hand.

### 👤 Rich player profiles

SoL-style hero, stat cards, slam-mix chart, standings vs leader, and a grouped slam timeline. Identical club slams without extra detail collapse into one row so the log stays readable.

### 🏆 Awards page with proper medal colours

Category winners (max white / max black) both get **gold** treatment — slam type (white vs black) is a secondary accent, not a fake silver-vs-gold ranking. The top-five race uses gold, silver, and bronze for positions 1–3.

### ⚙️ Issue-driven admin

No database admin UI on a server. Allowlisted users submit via [`/admin/`](https://swapnild2111.github.io/carrom/admin/) → GitHub Issue → Action runs Python validators → auto-commit → deploy. Five workflows: **add player**, **edit player**, **add club**, **add slam**, **edit slam**.

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
- Awards night? Open **https://swapnild2111.github.io/carrom/awards/2025/** on the big screen

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
| `data/slams.json` | One row per slam event |
| `data/seasons.json` | Season config (2025) |

Generated at build (`python3 scripts/build_derived.py`):

| Output | Purpose |
|--------|---------|
| `data/generated/*.json` | Leaderboard, awards, enriched views |
| `content/players/`, `content/clubs/` | Hugo pages (regenerated each build) |
| `static/data/*.json` | Copies for admin panel fetches + static serving |

Totals and ranks are **computed** from `slams.json`, never hand-edited.

### Repository layout

```
carrom/
├── README.md
├── LICENSE
├── config.toml              # Hugo site config + admin repo name
├── data/                    # source JSON (players, clubs, slams)
├── data/generated/          # leaderboard, awards, enriched views
├── content/                 # Hugo pages (players/clubs rebuilt by script)
├── layouts/                 # templates (home, player, club, awards, admin)
├── static/css|js/           # theme, charts, admin panel
├── scripts/                 # build, validate, issue handlers
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

| Label | Script |
|-------|--------|
| `add-player` | `add_player_from_issue.py` |
| `edit-player` | `edit_player_from_issue.py` |
| `add-club` | `add_club_from_issue.py` |
| `add-slam` | `add_slam_from_issue.py` |
| `edit-slam` | `edit_slam_from_issue.py` |

📖 Full operator guide: [docs/admin.md](docs/admin.md)

### Bootstrap from Excel (one-off)

`scripts/import_total_slam.py` reads `Carrom_records.xlsx` (gitignored) for initial migration. Preview by default; pass `--apply` to overwrite source JSON. Not wired to CI.

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

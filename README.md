# 🎯 Thane Carrom Slams

**Open-source slam tracker for Thane District — player profiles, club records, live leaderboard, and season awards.**

[![Live site](https://img.shields.io/badge/Live-site-4a9eff?style=for-the-badge)](https://swapnild2111.github.io/carrom/)
[![License: MIT](https://img.shields.io/badge/License-MIT-7dcea0?style=for-the-badge)](LICENSE)
[![Hugo](https://img.shields.io/badge/Built%20with-Hugo%20Extended-ff4088?style=for-the-badge&logo=hugo)](https://gohugo.io/)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-tests-3776ab?style=for-the-badge&logo=python&logoColor=white)](docs/testing.md)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub%20Actions-2088ff?style=for-the-badge&logo=githubactions&logoColor=white)](.github/workflows/test.yml)

**👉 [Open the tracker](https://swapnild2111.github.io/carrom/)**

---

## What's inside

Season **2025** Thane district carrom — every white and black slam logged, ranked, and celebrated.

| Section | What's there | What you do |
|---------|--------------|-------------|
| 🏠 **Home** | Live leaderboard, top-10 chart, white/black mix, podium radar | See who's leading the season at a glance |
| 👤 **Players** | Profile per player — stats, slam mix chart, timeline, gap to leader | Click any name on the leaderboard |
| 🏛️ **Clubs** | Club roster, slams logged through each club | Browse from `/clubs/` |
| 🏆 **Awards** | Max white slam & max black slam ceremony | Watch the embed + champion cards |
| ⚙️ **Admin** | Web forms for allowlisted editors | Add/edit players, clubs, and slams via GitHub Issues |

---

## Why this exists

Thane has a vibrant carrom scene — clubs, tournaments, YouTube slams — but no single place to track **who slammed how many times** across the district. This site is that place.

* 📊 **Totals are computed** — edit individual slam events, not hand-maintained counts
* 🔐 **Admin via GitHub** — every change is an auditable issue → validated commit
* 🆓 **Free & open source** — MIT-licensed code; fork it for your district
* 📱 **Mobile-friendly** — dark theme, charts, searchable player index
* ⚡ **Static & fast** — Hugo on GitHub Pages, no database server

Built by **Team Carrom and Flute**.

---

## Standout features

### 📈 Live charts on the home page

Top 10 bar chart, white/black doughnut, and a podium radar for the top three — all driven from `slams.json` at build time.

### 👤 Rich player profiles

SoL-style hero, stat cards, slam-mix chart, standings vs leader, and a grouped slam timeline (aggregate rows collapse identical club slams).

### 🏆 Awards page

Embedded ceremony video, champion cards for max white and max black slam, and “the race” panels for the top five in each category.

### ⚙️ Issue-driven admin

No database admin UI on a server. Allowlisted users submit via `/admin/` → GitHub Issue → Action runs Python validators → auto-commit → deploy. Supports **add player**, **edit player**, **add club**, **add slam**, and **edit slam**.

### 🧪 Full test pack

Every admin workflow has an E2E test (`pytest`) that runs issue scripts against fixture data. See [docs/testing.md](docs/testing.md).

---

## Quick start

### Use it

👉 **https://swapnild2111.github.io/carrom/**

Bookmark the home page, browse players, check awards — no account needed.

### For developers

```bash
# macOS
brew install hugo git

git clone https://github.com/swapnild2111/carrom.git
cd carrom

python3 -m venv .venv && source .venv/bin/activate
pip3 install -r scripts/requirements.txt

python3 scripts/build_derived.py   # required before first hugo run
hugo server -D
# → http://localhost:1313/  (dev baseURL, no /carrom/ prefix)
```

Production URL uses the `/carrom/` base path: `https://swapnild2111.github.io/carrom/`

```bash
hugo --minify   # output to ./public/
```

### Run tests

```bash
pip3 install -r scripts/requirements.txt
python3 -m pytest tests/ -v
```

---

## Data model

Source of truth (hand-edited only via admin/issues):

| File | Purpose |
|------|---------|
| `data/players.json` | Player profiles (Thane district) |
| `data/clubs.json` | Club entities |
| `data/slams.json` | One row per slam event |
| `data/seasons.json` | Season config (2025) |

Generated at build (`scripts/build_derived.py`):

* Leaderboard, awards, enriched player/club views → `data/generated/`
* Hugo pages → `content/players/`, `content/clubs/`
* Static copies → `static/data/` (admin panel fetches these)

Totals and ranks are **computed** from `slams.json`, never hand-edited.

---

## Admin

Open [`/admin/`](https://swapnild2111.github.io/carrom/admin/), sign in with a fine-grained GitHub PAT (Issues: read/write on this repo).

| Tab | Action |
|-----|--------|
| Add player | Register a new player |
| Edit player | Change name, aliases, gender, clubs; or deactivate |
| Add club | Create a club |
| Add slam | Log white/black slam |
| Edit slam | Update fields or soft-delete |

📖 **Full guide:** [docs/admin.md](docs/admin.md)

---

## Project layout

```
carrom/
├── config.toml              # Hugo site config
├── data/                    # source JSON (players, clubs, slams)
├── data/generated/          # leaderboard, awards, enriched views
├── content/                 # Hugo pages (players/clubs rebuilt by script)
├── layouts/                 # templates (home, player, club, awards, admin)
├── static/css|js/           # theme + admin panel
├── scripts/                 # build, validate, issue handlers
├── tests/                   # pytest E2E test pack
├── docs/                    # admin guide, testing docs
└── .github/
    ├── workflows/           # deploy, validate, process-*, test
    └── ISSUE_TEMPLATE/      # GitHub issue forms
```

---

## Contributing

* **Data corrections** — use the admin panel if you're allowlisted, or open an issue
* **Code** — PRs welcome; run `python3 -m pytest tests/ -v` before submitting
* **New district** — fork and adapt `data/` + `config.toml`; the pipeline is district-agnostic with minor tweaks

---

## License

* **Code** — [MIT License](LICENSE). Templates, CSS, JavaScript, Python scripts, and site configuration are free to use, fork, and modify.
* **Data** — player and club records are contributed by the Thane carrom community for public leaderboard use.

Built and maintained by [Swapnil Deshpande](https://github.com/swapnild2111). Tracking by **Team Carrom and Flute**.

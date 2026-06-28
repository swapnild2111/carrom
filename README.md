# Carrom Slam Achievements

Static Hugo site tracking **white slams** and **black slams** in singles and doubles tournaments.

**Live site:** https://swapnild2111.github.io/carrom/

## Data model

All achievement data lives in [`data/achievements.json`](data/achievements.json):

| Field | Description |
|-------|-------------|
| `players` | Registered players with display order |
| `slams` | Individual slam records (one entry per slam) |

Each slam record:

| Field | Values |
|-------|--------|
| `slamType` | `white` or `black` |
| `format` | `singles` or `doubles` |
| `tournament` | Event name |
| `date` | `YYYY-MM-DD` |

The leaderboard counts slams per player automatically at build time.

## Local development

```bash
# Install Hugo: https://gohugo.io/installation/
hugo server -D
# Open http://localhost:1313/carrom/

# Validate data
pip install -r scripts/requirements.txt
python scripts/validate_data.py

# Production build
hugo --minify
```

## Adding a slam (admin handover)

### Option A — GitHub Issue form (recommended)

1. Go to **Issues → New issue → Add slam achievement**
2. Fill in player, slam type, format, tournament, and date
3. Submit — a PR is created automatically with label `auto-merge`
4. After validation passes, the PR merges and the site redeploys (~2 min)

### Option B — Edit JSON directly

1. Edit `data/achievements.json` on GitHub or locally
2. Open a PR — validation runs on the PR
3. Merge when checks pass

## GitHub setup (one-time)

After pushing this repo to `main`:

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions
2. **Settings → General → Pull Requests:** enable **Allow auto-merge**
3. Add the second admin as a **collaborator** on the repo
4. (Optional) **Settings → Branches → Branch protection** on `main`:
   - Require PR before merging
   - Require status check: `validate`
   - Allow auto-merge

## Project structure

```
carrom/
├── config.toml              # Hugo config (baseURL for GitHub Pages)
├── data/
│   ├── achievements.json    # Source of truth
│   └── schema.json          # JSON schema for CI validation
├── layouts/                 # Hugo templates
├── static/css/              # Styles
├── scripts/
│   ├── validate_data.py     # Schema + referential checks
│   └── add_slam_from_issue.py
└── .github/
    ├── workflows/           # deploy, validate, auto-merge, process-slam
    └── ISSUE_TEMPLATE/      # Admin submission form
```

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy.yml` | Push to `main` | Build Hugo → GitHub Pages |
| `validate-data.yml` | PR / push | JSON schema + Hugo build check |
| `process-slam.yml` | Issue opened (`add-slam`) | Create PR from issue form |
| `auto-merge.yml` | PR labeled `auto-merge` | Squash-merge after validation |

## Phase 2 (later)

If the Issue form feels clunky, add a free Cloudflare Worker admin page that creates PRs via the GitHub API. The public site stays on GitHub Pages.

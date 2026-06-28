# Carrom Slam Achievements

Static Hugo site for **Total slam** records from the club Excel sheet.

**Live site:** https://swapnild2111.github.io/carrom/

## Data model (Total slam tab)

[`data/achievements.json`](data/achievements.json) mirrors the Excel **Total slam** sheet:

```json
{
  "year": 2025,
  "summary": {
    "club": { "white": 109, "black": 49 },
    "state": { "white": 12, "black": 4 },
    "totals": { "white": 121, "black": 53, "all": 174 }
  },
  "players": [
    {
      "id": "kunal-raut",
      "name": "Kunal Raut",
      "club": null,
      "slams": {
        "club": { "white": 22, "black": 7 },
        "state": { "white": 0, "black": 0 }
      },
      "totals": { "white": 22, "black": 7, "all": 29 }
    }
  ]
}
```

| JSON field | Excel column |
|------------|--------------|
| `slams.club.white` / `.black` | White / Black (Club) |
| `slams.state.white` / `.black` | White.1 / Black.1 (State and Youtube) |
| `totals.white` / `.black` / `.all` | Total White / Total Black / Total Slam |

## Import from Excel

```bash
pip install -r scripts/requirements.txt
python scripts/import_from_excel.py "Carrom records.xlsx"
python scripts/validate_data.py
```

Imports the **Total slam** sheet only.

## Local development

```bash
hugo server -D
# → http://localhost:1313/carrom/
```

## Adding a slam (admin)

**Issues → New issue → Add slam achievement** — pick player, slam type (white/black), and tier (Club / State & YouTube).

## Workflows

| Workflow | Purpose |
|----------|---------|
| `deploy.yml` | Hugo → GitHub Pages |
| `validate-data.yml` | JSON schema + Hugo build |
| `process-slam.yml` | Issue form → PR |
| `auto-merge.yml` | Auto-merge labeled PRs |

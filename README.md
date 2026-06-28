# Carrom Slam Achievements

Static Hugo site tracking **white slams** and **black slams** across Maharashtra state tournaments.

**Live site:** https://swapnild2111.github.io/carrom/

## Data model (mirrors Excel workbook)

All data lives in [`data/achievements.json`](data/achievements.json):

| Section | Excel sheet | Purpose |
|---------|-------------|---------|
| `players` | White slam / Black slam | Name, gender, district, totals |
| `tournaments` | Matrix column headers | Tournament names |
| `slamMatrix.white` / `.black` | White slam / Black slam | Player × tournament **counts** |
| `slamEvents` | white / black | Match-level log (`Match · Set · Board`) |

```json
{
  "year": 2025,
  "players": [{ "id": "...", "name": "...", "gender": "male", "district": "Mumbai", "totals": { "white": 9, "black": 3 } }],
  "tournaments": [{ "id": "...", "name": "58th Senior Maharashtra State Carrom Championship" }],
  "slamMatrix": { "white": [{ "playerId": "...", "counts": { "tournament-id": 2 } }], "black": [] },
  "slamEvents": [{ "id": "evt-001", "playerId": "...", "slamType": "white", "district": "Pune", "match": { "number": 44, "set": 2, "board": 1 } }]
}
```

## Import from Excel

```bash
pip install -r scripts/requirements.txt
python scripts/import_from_excel.py "Carrom records.xlsx"
python scripts/validate_data.py
```

Re-run import whenever the Excel file is updated for a new season (adjust `year` in the script if needed).

## Local development

```bash
hugo server -D
# → http://localhost:1313/carrom/
```

## Adding a slam (admin)

**Issues → New issue → Add slam achievement** — creates a PR that auto-merges after validation.

Or edit `data/achievements.json` directly and open a PR.

## GitHub setup

1. **Settings → Pages → Source:** GitHub Actions
2. **Settings → Pull Requests:** enable **Allow auto-merge**
3. Add co-admin as collaborator

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy.yml` | Push to `main` | Build Hugo → GitHub Pages |
| `validate-data.yml` | PR / push | JSON schema + Hugo build |
| `process-slam.yml` | Issue (`add-slam`) | Create PR from issue form |
| `auto-merge.yml` | PR labeled `auto-merge` | Squash-merge after validation |

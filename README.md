# Thane Carrom Slams

Thane District slam tracker by **Team Carrom and Flute** — player profiles, club records, and season awards.

**Live:** https://swapnild2111.github.io/carrom/

## Data model (v1)

Source of truth:

| File | Purpose |
|------|---------|
| `data/players.json` | Player profiles (Thane only) |
| `data/clubs.json` | Club entities |
| `data/slams.json` | One row per slam event |
| `data/seasons.json` | Season config (2025) |

Generated at build (`scripts/build_derived.py`):

- Leaderboard, awards, enriched player/club views
- Hugo content pages under `content/players/`, `content/clubs/`, `content/awards/`

Totals and ranks are **computed** from `slams.json`, not hand-edited.

## Local development

```bash
pip install -r scripts/requirements.txt
python scripts/build_derived.py
python scripts/validate_schema.py
hugo server -D
# → http://localhost:1313/carrom/
```

## Admin

Open `/admin/`, sign in with a fine-grained GitHub PAT (Issues: Read and write on this repo).

Forms create GitHub Issues → Actions commit to `main` → site redeploys.

## Pages

- `/` — Thane 2025 leaderboard
- `/players/{slug}/` — player profile + slam history
- `/clubs/{slug}/` — club roster + slams logged
- `/awards/2025/` — max white / max black slam awards

# Testing

The **test pack** exercises every admin workflow end-to-end without calling the live GitHub API. Tests run issue-parser scripts against isolated fixture data, then validate and rebuild derived JSON.

## Run locally

```bash
pip3 install -r scripts/requirements.txt
python3 -m pytest tests/ -v
```

Full CI-style check (includes production data validation and Hugo build inputs):

```bash
python3 scripts/validate_schema.py
python3 -m pytest tests/ -v
python3 scripts/build_derived.py
python3 scripts/validate_schema.py
```

## What is covered

| Test module | Scope |
|-------------|-------|
| `test_lib.py` | `slugify`, issue body parsing, alias/club ID parsing |
| `test_validate_schema.py` | Production `data/*.json` passes validation |
| `test_admin_workflows.py` | All five admin pipelines |

### Admin workflows (E2E)

Each workflow runs `*_from_issue.py` → `validate_schema.py` → `build_derived.py` → `validate_schema.py` in a temporary data directory:

1. **Add club** — `add_club_from_issue.py`
2. **Add player** — `add_player_from_issue.py`
3. **Add slam** — `add_slam_from_issue.py`
4. **Edit player (update)** — name, gender, aliases, clubs via template labels
5. **Edit player (deactivate)** — `active: false`
6. **Edit slam (update)** — type and notes (GitHub template `Notes` label)
7. **Edit slam (delete)** — soft-delete
8. **Full lifecycle** — all steps in one sequence + generated artifacts

Fixtures live in `tests/fixtures/data/` (empty seed) and `tests/fixtures/issues/` (sample issue bodies matching GitHub templates and the admin UI).

## CI

GitHub Actions workflow [`.github/workflows/test.yml`](../.github/workflows/test.yml) runs on every push and pull request.

## Environment overrides (for tests)

Scripts read optional path overrides from the environment:

| Variable | Default |
|----------|---------|
| `CARROM_DATA_DIR` | `data/` |
| `CARROM_CONTENT_PLAYERS` | `content/players/` |
| `CARROM_CONTENT_CLUBS` | `content/clubs/` |
| `CARROM_STATIC_DATA` | `static/data/` |

Tests set these to a temp directory so production data is never modified.

#!/usr/bin/env python3
"""Validate data/achievements.json against data/schema.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("Install jsonschema: pip install jsonschema")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "achievements.json"
SCHEMA_FILE = ROOT / "data" / "schema.json"


def main() -> int:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))

    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))

    if errors:
        print(f"Validation failed for {DATA_FILE}:")
        for err in errors:
            path = ".".join(str(p) for p in err.path) or "(root)"
            print(f"  - {path}: {err.message}")
        return 1

    player_ids = {p["id"] for p in data["players"]}
    if len(player_ids) != len(data["players"]):
        print("Duplicate player ids found.")
        return 1

    for player in data["players"]:
        club = player["slams"]["club"]
        state = player["slams"]["state"]
        expected_white = club["white"] + state["white"]
        expected_black = club["black"] + state["black"]
        expected_all = expected_white + expected_black

        if player["totals"]["white"] != expected_white:
            print(f"{player['name']}: total white {player['totals']['white']} != {expected_white}")
            return 1
        if player["totals"]["black"] != expected_black:
            print(f"{player['name']}: total black {player['totals']['black']} != {expected_black}")
            return 1
        if player["totals"]["all"] != expected_all:
            print(f"{player['name']}: total all {player['totals']['all']} != {expected_all}")
            return 1

    summary = data["summary"]
    club_w = sum(p["slams"]["club"]["white"] for p in data["players"])
    club_b = sum(p["slams"]["club"]["black"] for p in data["players"])
    state_w = sum(p["slams"]["state"]["white"] for p in data["players"])
    state_b = sum(p["slams"]["state"]["black"] for p in data["players"])

    if summary["club"]["white"] != club_w or summary["club"]["black"] != club_b:
        print("Summary club totals do not match player sums.")
        return 1
    if summary["state"]["white"] != state_w or summary["state"]["black"] != state_b:
        print("Summary state totals do not match player sums.")
        return 1

    s = summary["totals"]
    print(
        f"OK: {data['year']} — {len(data['players'])} players, "
        f"{s['all']} total slams ({s['white']} white / {s['black']} black)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

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
    slam_ids = set()
    duplicate_players = len(data["players"]) != len(player_ids)

    if duplicate_players:
        print("Duplicate player ids found.")
        return 1

    for slam in data["slams"]:
        if slam["id"] in slam_ids:
            print(f"Duplicate slam id: {slam['id']}")
            return 1
        slam_ids.add(slam["id"])

        if slam["playerId"] not in player_ids:
            print(f"Slam {slam['id']} references unknown playerId: {slam['playerId']}")
            return 1

    print(f"OK: {len(data['players'])} players, {len(data['slams'])} slams")
    return 0


if __name__ == "__main__":
    sys.exit(main())

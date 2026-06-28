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
    tournament_ids = {t["id"] for t in data["tournaments"]}

    if len(data["players"]) != len(player_ids):
        print("Duplicate player ids found.")
        return 1

    event_ids: set[str] = set()
    for event in data["slamEvents"]:
        if event["id"] in event_ids:
            print(f"Duplicate event id: {event['id']}")
            return 1
        event_ids.add(event["id"])

        if event["playerId"] not in player_ids:
            print(f"Event {event['id']} references unknown playerId: {event['playerId']}")
            return 1

        tid = event.get("tournamentId")
        if tid and tid not in tournament_ids:
            print(f"Event {event['id']} references unknown tournamentId: {tid}")
            return 1

    for slam_type in ("white", "black"):
        for row in data["slamMatrix"][slam_type]:
            if row["playerId"] not in player_ids:
                print(f"Matrix row references unknown playerId: {row['playerId']}")
                return 1
            for tid, count in row["counts"].items():
                if tid not in tournament_ids:
                    print(f"Matrix references unknown tournamentId: {tid}")
                    return 1
                if count < 0:
                    print(f"Negative count for {row['playerId']} / {tid}")
                    return 1

    # Verify player totals match matrix sums
    for player in data["players"]:
        pid = player["id"]
        for slam_type in ("white", "black"):
            matrix_total = 0
            for row in data["slamMatrix"][slam_type]:
                if row["playerId"] == pid:
                    matrix_total = sum(row["counts"].values())
                    break
            if matrix_total != player["totals"][slam_type]:
                print(
                    f"Total mismatch for {player['name']} ({slam_type}): "
                    f"player.totals={player['totals'][slam_type]}, matrix={matrix_total}"
                )
                return 1

    white = sum(p["totals"]["white"] for p in data["players"])
    black = sum(p["totals"]["black"] for p in data["players"])
    print(
        f"OK: {data['year']} — {len(data['players'])} players, "
        f"{len(data['tournaments'])} tournaments, "
        f"{len(data['slamEvents'])} events, "
        f"{white} white / {black} black slams"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

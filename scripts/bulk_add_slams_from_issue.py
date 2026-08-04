#!/usr/bin/env python3
"""Parse a bulk-add-slam issue and append N aggregate slam rows for a player.

Issue fields:
    Player id     — required, slug
    Season        — required, fiscal starting year (int)
    Type          — required, white|black
    Count         — required, positive int, max 100
    Source        — optional, defaults to "club"
    Club id       — optional, defaults to player.clubIds[0]

Each new row is inserted with `aggregate: true` and no user-added detail
(date/videoUrl/matchRef/tournament/notes are all null). IDs are allocated
sequentially via the existing next_slam_id helper from add_slam_from_issue.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from add_slam_from_issue import next_slam_id
from lib import DATA, SLAM_SOURCES, SLAM_TYPES, parse_issue_fields

SLAMS_FILE = DATA / "slams.json"
PLAYERS_FILE = DATA / "players.json"
CLUBS_FILE = DATA / "clubs.json"

MAX_BULK = 100


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    player_id = fields.get("player id", "").strip()
    season_raw = fields.get("season", "").strip()
    slam_type = fields.get("type", "").strip().lower()
    count_raw = fields.get("count", "").strip()
    source = (fields.get("source", "").strip().lower() or "club")
    club_id_input = fields.get("club id", "").strip() or None

    if not player_id:
        print("Player id is required.", file=sys.stderr)
        return 1
    if slam_type not in SLAM_TYPES:
        print(f"Type must be one of {sorted(SLAM_TYPES)}", file=sys.stderr)
        return 1
    if source not in SLAM_SOURCES:
        print(f"Source must be one of {sorted(SLAM_SOURCES)}", file=sys.stderr)
        return 1

    try:
        season = int(season_raw)
    except ValueError:
        print(f"Season must be an int, got {season_raw!r}", file=sys.stderr)
        return 1

    try:
        count = int(count_raw)
    except ValueError:
        print(f"Count must be a positive int, got {count_raw!r}", file=sys.stderr)
        return 1
    if count <= 0:
        print("Count must be greater than zero.", file=sys.stderr)
        return 1
    if count > MAX_BULK:
        print(f"Count {count} exceeds bulk limit of {MAX_BULK}.", file=sys.stderr)
        return 1

    players = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))["players"]
    player = next((p for p in players if p["id"] == player_id), None)
    if not player:
        print(f"Unknown player id: {player_id}", file=sys.stderr)
        return 1

    if source == "club":
        club_id = club_id_input or (player.get("clubIds") or [None])[0]
        if not club_id:
            print(f"Player {player_id} has no club on file; specify Club id.", file=sys.stderr)
            return 1
        clubs = json.loads(CLUBS_FILE.read_text(encoding="utf-8"))["clubs"]
        if not any(c["id"] == club_id for c in clubs):
            print(f"Unknown club id: {club_id}", file=sys.stderr)
            return 1
    else:
        club_id = club_id_input

    data = json.loads(SLAMS_FILE.read_text(encoding="utf-8"))
    slams = data.setdefault("slams", [])

    new_ids: list[str] = []
    for _ in range(count):
        slam_id = next_slam_id(slams, season)
        slam = {
            "id": slam_id,
            "playerId": player_id,
            "season": season,
            "type": slam_type,
            "source": source,
            "clubId": club_id,
            "tournament": None,
            "date": None,
            "location": "Thane",
            "videoUrl": None,
            "matchRef": None,
            "notes": None,
            "active": True,
            "aggregate": True,
        }
        slams.append(slam)
        new_ids.append(slam_id)

    data["lastUpdated"] = date.today().isoformat()
    SLAMS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added {count} {slam_type} slams for {player_id} (season {season}): {new_ids[0]}..{new_ids[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

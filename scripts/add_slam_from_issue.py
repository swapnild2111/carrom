#!/usr/bin/env python3
"""Parse add-slam issue and append slams.json."""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields

SLAMS_FILE = DATA / "slams.json"
PLAYERS_FILE = DATA / "players.json"
CLUBS_FILE = DATA / "clubs.json"


def next_slam_id(slams: list[dict], season: int) -> str:
    prefix = f"slam-{season}-"
    numbers = []
    for slam in slams:
        match = re.fullmatch(rf"slam-{season}-(\d+)", slam.get("id", ""))
        if match:
            numbers.append(int(match.group(1)))
    n = max(numbers, default=0) + 1
    return f"{prefix}{n:03d}"


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    player_id = fields.get("player id", "").strip()
    slam_type = fields.get("slam type", "").strip().lower()
    source = fields.get("source", "").strip().lower()
    season_raw = fields.get("season", "2025").strip() or "2025"

    if not player_id:
        print("Player id is required.", file=sys.stderr)
        return 1
    if slam_type not in {"white", "black"}:
        print("Slam type must be white or black.", file=sys.stderr)
        return 1
    if source not in {"youtube", "club", "tournament"}:
        print("Source must be youtube, club, or tournament.", file=sys.stderr)
        return 1

    players = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))["players"]
    if not any(p["id"] == player_id for p in players):
        print(f"Unknown player id: {player_id}", file=sys.stderr)
        return 1

    try:
        season = int(season_raw)
    except ValueError:
        print("Season must be a year number.", file=sys.stderr)
        return 1

    club_id = fields.get("club id", "").strip() or None
    if source == "club" and not club_id:
        print("Club id is required when source is club.", file=sys.stderr)
        return 1
    if club_id:
        clubs = json.loads(CLUBS_FILE.read_text(encoding="utf-8"))["clubs"]
        if not any(c["id"] == club_id for c in clubs):
            print(f"Unknown club id: {club_id}", file=sys.stderr)
            return 1

    data = json.loads(SLAMS_FILE.read_text(encoding="utf-8"))
    slams = data.setdefault("slams", [])

    slam = {
        "id": next_slam_id(slams, season),
        "playerId": player_id,
        "season": season,
        "type": slam_type,
        "source": source,
        "clubId": club_id,
        "tournament": fields.get("tournament (optional)", "").strip() or None,
        "date": fields.get("date (yyyy-mm-dd)", "").strip() or None,
        "location": fields.get("location (optional)", "").strip() or None,
        "videoUrl": fields.get("video url (optional)", "").strip() or None,
        "matchRef": fields.get("match ref (optional)", "").strip() or None,
        "notes": fields.get("notes (optional)", "").strip() or None,
        "active": True,
    }

    slams.append(slam)
    data["lastUpdated"] = date.today().isoformat()
    SLAMS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added slam {slam['id']} for {player_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Parse add-player issue and upsert players.json."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_aliases, parse_club_ids, parse_issue_fields, slugify

PLAYERS_FILE = DATA / "players.json"


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    name = fields.get("full name", "").strip()
    if not name:
        print("Full name is required.", file=sys.stderr)
        return 1

    player_id = slugify(name)
    gender = fields.get("gender", "").strip().lower()
    if gender not in {"male", "female"}:
        print("Gender must be Male or Female.", file=sys.stderr)
        return 1

    district = fields.get("district", "Thane").strip() or "Thane"
    if district.lower() != "thane":
        print("Prototype only supports Thane district players.", file=sys.stderr)
        return 1

    profile = {
        "id": player_id,
        "name": name,
        "aliases": parse_aliases(fields.get("aliases (optional)", "")),
        "district": "Thane",
        "gender": gender,
        "clubIds": parse_club_ids(fields.get("club ids (comma-separated)", "")),
        "active": True,
    }

    data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    players = data.setdefault("players", [])
    existing = next((p for p in players if p["id"] == player_id), None)
    if existing:
        existing.update(profile)
    else:
        players.append(profile)

    players.sort(key=lambda p: p["name"].lower())
    data["lastUpdated"] = date.today().isoformat()
    PLAYERS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Upserted player {player_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

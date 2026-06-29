#!/usr/bin/env python3
"""Parse add-club issue and upsert clubs.json."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields, slugify

CLUBS_FILE = DATA / "clubs.json"


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    name = fields.get("club name", "").strip()
    if not name:
        print("Club name is required.", file=sys.stderr)
        return 1

    club_id = slugify(name)
    district = fields.get("district", "Thane").strip() or "Thane"
    if district.lower() != "thane":
        print("Prototype only supports Thane district clubs.", file=sys.stderr)
        return 1

    club = {
        "id": club_id,
        "name": name,
        "district": "Thane",
        "contact": fields.get("contact (optional)", "").strip() or None,
        "notes": fields.get("notes (optional)", "").strip() or None,
        "active": True,
    }

    data = json.loads(CLUBS_FILE.read_text(encoding="utf-8"))
    clubs = data.setdefault("clubs", [])
    existing = next((c for c in clubs if c["id"] == club_id), None)
    if existing:
        existing.update(club)
    else:
        clubs.append(club)

    clubs.sort(key=lambda c: c["name"].lower())
    data["lastUpdated"] = date.today().isoformat()
    CLUBS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Upserted club {club_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

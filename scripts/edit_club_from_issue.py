#!/usr/bin/env python3
"""Parse edit-club issue to update or deactivate a club.

The club `id` is never rewritten — renaming a club would break slam references
(clubs are referenced by id from slams.json). Editing the display `name` is
fine and doesn't change the id.

Issue fields:
    Club id                — required
    Action                 — optional, default "update" (update|deactivate)
    Name (optional)        — new display name
    Contact (optional)
    Notes (optional)
    Restore (true/false)   — reactivate if deactivated
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields

CLUBS_FILE = DATA / "clubs.json"


def parse_bool(value: str) -> bool | None:
    text = value.strip().lower()
    if text in {"true", "yes", "1"}:
        return True
    if text in {"false", "no", "0"}:
        return False
    return None


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    club_id = fields.get("club id", "").strip()
    if not club_id:
        print("Club id is required.", file=sys.stderr)
        return 1

    data = json.loads(CLUBS_FILE.read_text(encoding="utf-8"))
    clubs = data.get("clubs", [])
    club = next((c for c in clubs if c["id"] == club_id), None)
    if not club:
        print(f"Unknown club id: {club_id}", file=sys.stderr)
        return 1

    action = fields.get("action", "update").strip().lower() or "update"
    if action == "deactivate":
        club["active"] = False
    elif action == "update":
        if fields.get("name (optional)", "").strip():
            club["name"] = fields["name (optional)"].strip()
        if "contact (optional)" in fields:
            club["contact"] = fields["contact (optional)"].strip() or None
        if "notes (optional)" in fields:
            club["notes"] = fields["notes (optional)"].strip() or None
        restore = parse_bool(fields.get("restore (true/false)", ""))
        if restore is True:
            club["active"] = True
    else:
        print("Action must be update or deactivate.", file=sys.stderr)
        return 1

    data["lastUpdated"] = date.today().isoformat()
    CLUBS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Processed club {club_id} ({action})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

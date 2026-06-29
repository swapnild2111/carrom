#!/usr/bin/env python3
"""Parse edit-slam issue to update or soft-delete a slam."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields

SLAMS_FILE = DATA / "slams.json"


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

    slam_id = fields.get("slam id", "").strip()
    if not slam_id:
        print("Slam id is required.", file=sys.stderr)
        return 1

    data = json.loads(SLAMS_FILE.read_text(encoding="utf-8"))
    slams = data.get("slams", [])
    slam = next((s for s in slams if s["id"] == slam_id), None)
    if not slam:
        print(f"Unknown slam id: {slam_id}", file=sys.stderr)
        return 1

    action = fields.get("action", "update").strip().lower()
    if action == "delete":
        slam["active"] = False
    elif action == "update":
        if fields.get("slam type", "").strip():
            slam_type = fields["slam type"].strip().lower()
            if slam_type not in {"white", "black"}:
                print("Slam type must be white or black.", file=sys.stderr)
                return 1
            slam["type"] = slam_type
        if fields.get("source", "").strip():
            source = fields["source"].strip().lower()
            if source not in {"youtube", "club", "tournament"}:
                print("Invalid source.", file=sys.stderr)
                return 1
            slam["source"] = source
        for key, field in [
            ("clubId", "club id"),
            ("tournament", "tournament (optional)"),
            ("date", "date (yyyy-mm-dd)"),
            ("location", "location (optional)"),
            ("videoUrl", "video url (optional)"),
            ("matchRef", "match ref (optional)"),
            ("notes", "notes (optional)"),
        ]:
            if fields.get(field, "").strip():
                slam[key] = fields[field].strip() or None
        restore = parse_bool(fields.get("restore (true/false)", ""))
        if restore is True:
            slam["active"] = True
    else:
        print("Action must be update or delete.", file=sys.stderr)
        return 1

    data["lastUpdated"] = date.today().isoformat()
    SLAMS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Processed slam {slam_id} ({action})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

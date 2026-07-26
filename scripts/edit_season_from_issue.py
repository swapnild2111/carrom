#!/usr/bin/env python3
"""Parse edit-season issue and update an existing seasons.json entry."""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields

SEASONS_FILE = DATA / "seasons.json"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _bool_from_field(raw: str) -> bool | None:
    v = raw.strip().lower()
    if v in {"true", "yes", "1"}:
        return True
    if v in {"false", "no", "0"}:
        return False
    return None


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    year_raw = fields.get("season", "").strip() or fields.get("year", "").strip()
    if not year_raw:
        print("Season (year) is required.", file=sys.stderr)
        return 1
    try:
        year = int(year_raw)
    except ValueError:
        print(f"Invalid season year: {year_raw!r}", file=sys.stderr)
        return 1

    data = json.loads(SEASONS_FILE.read_text(encoding="utf-8"))
    seasons = data.get("seasons", [])
    entry = next((s for s in seasons if int(s.get("year", 0)) == year), None)
    if entry is None:
        print(f"Season {year} not found.", file=sys.stderr)
        return 1

    label = fields.get("label", "").strip()
    start = fields.get("start date", "").strip()
    end = fields.get("end date", "").strip()
    available_raw = fields.get("available", "").strip()

    if label:
        entry["label"] = label
    if start:
        if not DATE_RE.match(start):
            print(f"Start date must be YYYY-MM-DD: {start!r}", file=sys.stderr)
            return 1
        entry["start"] = start
    if end:
        if not DATE_RE.match(end):
            print(f"End date must be YYYY-MM-DD: {end!r}", file=sys.stderr)
            return 1
        entry["end"] = end
    if available_raw:
        parsed = _bool_from_field(available_raw)
        if parsed is None:
            print(f"Available must be true/false/yes/no: {available_raw!r}", file=sys.stderr)
            return 1
        entry["available"] = parsed

    if date.fromisoformat(entry["end"]) <= date.fromisoformat(entry["start"]):
        print("End date must be after start date.", file=sys.stderr)
        return 1

    SEASONS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated season {year}: label={entry['label']} start={entry['start']} end={entry['end']} available={entry.get('available', True)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

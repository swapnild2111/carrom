#!/usr/bin/env python3
"""Parse add-season issue and append seasons.json."""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_issue_fields

SEASONS_FILE = DATA / "seasons.json"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _label_from_year(year: int) -> str:
    return f"{year}–{str(year + 1)[-2:]}"


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    year_raw = fields.get("start year", "").strip()
    start = fields.get("start date", "").strip()
    end = fields.get("end date", "").strip()
    label = fields.get("label", "").strip()

    if not year_raw:
        print("Start year is required.", file=sys.stderr)
        return 1
    try:
        year = int(year_raw)
    except ValueError:
        print(f"Invalid start year: {year_raw!r}", file=sys.stderr)
        return 1
    if not (2000 <= year <= 2100):
        print(f"Start year out of range (2000-2100): {year}", file=sys.stderr)
        return 1

    if not DATE_RE.match(start):
        print(f"Start date must be YYYY-MM-DD: {start!r}", file=sys.stderr)
        return 1
    if not DATE_RE.match(end):
        print(f"End date must be YYYY-MM-DD: {end!r}", file=sys.stderr)
        return 1
    if date.fromisoformat(end) <= date.fromisoformat(start):
        print("End date must be after start date.", file=sys.stderr)
        return 1

    data = json.loads(SEASONS_FILE.read_text(encoding="utf-8"))
    seasons = data.setdefault("seasons", [])
    if any(int(s.get("year", 0)) == year for s in seasons):
        print(f"Season with year {year} already exists. Use edit-season to modify.", file=sys.stderr)
        return 1

    seasons.append({
        "year": year,
        "label": label or _label_from_year(year),
        "start": start,
        "end": end,
        "available": True,
    })
    seasons.sort(key=lambda s: int(s.get("year", 0)))

    SEASONS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added season {year} ({label or _label_from_year(year)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

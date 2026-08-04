#!/usr/bin/env python3
"""One-off migration: tag every slam row with an `aggregate` boolean.

Rule: aggregate = True iff none of date/videoUrl/matchRef/tournament/notes are
populated AND source == "club". This flag lets the bulk-add/delete admin flow
know which rows are safe to soft-delete when reducing a player's slam count
without losing rows that carry real per-slam detail (videos, tournament refs,
dated matches).

Idempotent — re-running against an already-migrated slams.json is a no-op.
Prints a summary so operators can eyeball the split.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA

SLAMS_FILE = DATA / "slams.json"


def is_aggregate(slam: dict) -> bool:
    """A slam is aggregate iff it has no user-added detail (date, videoUrl,
    matchRef, tournament, notes). The `source` field alone doesn't count as
    detail — an unpopulated YouTube-source row is still an aggregate placeholder.
    """
    detail_fields = ("date", "videoUrl", "matchRef", "tournament", "notes")
    for field in detail_fields:
        value = slam.get(field)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return False
    return True


def main() -> int:
    data = json.loads(SLAMS_FILE.read_text(encoding="utf-8"))
    slams = data.get("slams", [])

    changed = 0
    aggregate_count = 0
    detailed_count = 0
    for slam in slams:
        want = is_aggregate(slam)
        if "aggregate" not in slam or slam["aggregate"] != want:
            slam["aggregate"] = want
            changed += 1
        if want:
            aggregate_count += 1
        else:
            detailed_count += 1

    if changed == 0:
        print(f"No changes ({len(slams)} rows already tagged): {aggregate_count} aggregate, {detailed_count} detailed.")
        return 0

    data["lastUpdated"] = date.today().isoformat()
    SLAMS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Tagged {changed} rows: {aggregate_count} aggregate, {detailed_count} detailed (total {len(slams)}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

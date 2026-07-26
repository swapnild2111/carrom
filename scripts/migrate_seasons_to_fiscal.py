#!/usr/bin/env python3
"""One-time migration: relabel existing calendar-year slams as fiscal-year 2024–25.

Before: season=2025 (meant "the 2025 calendar year")
After:  season=2024 (starting year of "2024–25", = Apr 2024 – Mar 2025)

Runs in-place on data/slams.json. Idempotent — re-running is a no-op.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLAMS_FILE = ROOT / "data" / "slams.json"

OLD_SEASON = 2025
NEW_SEASON = 2024
OLD_ID_RE = re.compile(r"^slam-2025-(\d+)$")


def main() -> int:
    data = json.loads(SLAMS_FILE.read_text(encoding="utf-8"))
    changed = 0
    for slam in data.get("slams", []):
        if slam.get("season") == OLD_SEASON:
            slam["season"] = NEW_SEASON
            changed += 1
        match = OLD_ID_RE.match(slam.get("id", ""))
        if match:
            slam["id"] = f"slam-{NEW_SEASON}-{match.group(1)}"

    data["lastUpdated"] = date.today().isoformat()
    SLAMS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Migrated {changed} slams: season {OLD_SEASON} → {NEW_SEASON}, IDs slam-2025-* → slam-2024-*")
    return 0


if __name__ == "__main__":
    sys.exit(main())

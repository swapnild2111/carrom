#!/usr/bin/env python3
"""Import Total slam sheet from Carrom records.xlsx into data/achievements.json."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Install pandas and openpyxl: pip install pandas openpyxl")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
XLSX_DEFAULT = ROOT / "Carrom records.xlsx"
OUTPUT = ROOT / "data" / "achievements.json"
SHEET_NAME = "Total slam"


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug or "player"


def int_val(value) -> int:
    if pd.isna(value):
        return 0
    return int(value)


def import_total_slam(xlsx: Path, year: int = 2025) -> dict:
    df = pd.read_excel(xlsx, sheet_name=SHEET_NAME, header=1)
    df = df.dropna(subset=["Player"])
    df = df[df["Player"].astype(str).str.strip() != ""]

    players: list[dict] = []
    used_ids: set[str] = set()

    for _, row in df.iterrows():
        name = str(row["Player"]).strip()
        base_id = slugify(name)
        player_id = base_id
        suffix = 2
        while player_id in used_ids:
            player_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(player_id)

        club_white = int_val(row.get("White"))
        club_black = int_val(row.get("Black"))
        state_white = int_val(row.get("White.1"))
        state_black = int_val(row.get("Black.1"))

        total_white = int_val(row.get("Total White"))
        total_black = int_val(row.get("Total Black"))
        total_all = int_val(row.get("Total Slam"))

        club_field = row.get("Club")
        club_name = None
        if pd.notna(club_field) and str(club_field).strip():
            club_name = str(club_field).strip()

        players.append(
            {
                "id": player_id,
                "name": name,
                "club": club_name,
                "displayOrder": 0,
                "slams": {
                    "club": {"white": club_white, "black": club_black},
                    "state": {"white": state_white, "black": state_black},
                },
                "totals": {
                    "white": total_white,
                    "black": total_black,
                    "all": total_all,
                },
            }
        )

    players.sort(key=lambda p: (-p["totals"]["all"], -p["totals"]["white"], p["name"]))
    for order, player in enumerate(players, start=1):
        player["displayOrder"] = order

    summary_club = {"white": 0, "black": 0}
    summary_state = {"white": 0, "black": 0}
    for player in players:
        summary_club["white"] += player["slams"]["club"]["white"]
        summary_club["black"] += player["slams"]["club"]["black"]
        summary_state["white"] += player["slams"]["state"]["white"]
        summary_state["black"] += player["slams"]["state"]["black"]

    total_white = sum(p["totals"]["white"] for p in players)
    total_black = sum(p["totals"]["black"] for p in players)

    return {
        "year": year,
        "lastUpdated": date.today().isoformat(),
        "summary": {
            "club": summary_club,
            "state": summary_state,
            "totals": {
                "white": total_white,
                "black": total_black,
                "all": total_white + total_black,
            },
        },
        "players": players,
    }


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else XLSX_DEFAULT
    if not xlsx.exists():
        print(f"Excel file not found: {xlsx}")
        return 1

    data = import_total_slam(xlsx)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    s = data["summary"]
    print(f"Imported {SHEET_NAME} from {xlsx.name} → {OUTPUT}")
    print(f"  Year: {data['year']}")
    print(f"  Players: {len(data['players'])}")
    print(
        f"  Club: {s['club']['white']} white / {s['club']['black']} black · "
        f"State: {s['state']['white']} white / {s['state']['black']} black"
    )
    print(f"  Totals: {s['totals']['white']} white / {s['totals']['black']} black / {s['totals']['all']} all")
    return 0


if __name__ == "__main__":
    sys.exit(main())

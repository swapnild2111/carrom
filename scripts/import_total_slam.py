#!/usr/bin/env python3
"""Import players and slam counts from Excel Total slam tab into v1 JSON schema."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Install dependencies: pip install pandas openpyxl", file=sys.stderr)
    sys.exit(1)

from lib import DATA, PROTOTYPE_DISTRICT, slugify

ROOT = Path(__file__).resolve().parent.parent
XLSX_DEFAULT = ROOT / "Carrom records.xlsx"
PLAYERS_FILE = DATA / "players.json"
CLUBS_FILE = DATA / "clubs.json"
SLAMS_FILE = DATA / "slams.json"

SAI_CLUB_ID = "sai-carrom"
SAI_CLUB_NAME = "Sai Carrom"
SEASON = 2025


def load_total_slam_sheet(xlsx: Path) -> pd.DataFrame:
    df = pd.read_excel(xlsx, sheet_name="Total slam", header=1)
    df = df.rename(
        columns={
            "White": "club_white",
            "Black": "club_black",
            "White.1": "state_white",
            "Black.1": "state_black",
            "Total White": "total_white",
            "Total Black": "total_black",
            "Total Slam": "total_slam",
        }
    )
    df = df[df["Player"].notna()]
    df["Player"] = df["Player"].astype(str).str.strip()
    df = df[df["Player"].str.len() > 0]
    for col in ("club_white", "club_black", "state_white", "state_black", "total_white", "total_black", "total_slam"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)
    return df.sort_values("total_slam", ascending=False).reset_index(drop=True)


def expand_slams(player_id: str, club_white: int, club_black: int, state_white: int, state_black: int) -> list[dict]:
    events: list[dict] = []
    counter = 1

    def add_batch(count: int, slam_type: str, source: str, club_id: str | None) -> None:
        nonlocal counter
        for _ in range(count):
            events.append(
                {
                    "playerId": player_id,
                    "season": SEASON,
                    "type": slam_type,
                    "source": source,
                    "clubId": club_id,
                    "tournament": None,
                    "date": None,
                    "location": PROTOTYPE_DISTRICT,
                    "videoUrl": None,
                    "matchRef": None,
                    "notes": "Imported from Total slam Excel sheet (2025 aggregate)",
                    "active": True,
                    "_batch": counter,
                }
            )
            counter += 1

    add_batch(club_white, "white", "club", SAI_CLUB_ID)
    add_batch(club_black, "black", "club", SAI_CLUB_ID)
    add_batch(state_white, "white", "youtube", None)
    add_batch(state_black, "black", "youtube", None)
    return events


def build_dataset(df: pd.DataFrame) -> tuple[list[dict], list[dict], list[dict]]:
    players: list[dict] = []
    slams: list[dict] = []
    seen_ids: set[str] = set()

    for _, row in df.iterrows():
        name = row["Player"]
        player_id = slugify(name)
        if player_id in seen_ids:
            raise ValueError(f"Duplicate slug {player_id!r} for player {name!r}")
        seen_ids.add(player_id)

        players.append(
            {
                "id": player_id,
                "name": name,
                "aliases": [],
                "district": PROTOTYPE_DISTRICT,
                "gender": "male",
                "clubIds": [SAI_CLUB_ID],
                "active": True,
            }
        )
        slams.extend(
            expand_slams(
                player_id,
                int(row["club_white"]),
                int(row["club_black"]),
                int(row["state_white"]),
                int(row["state_black"]),
            )
        )

    for index, slam in enumerate(slams, start=1):
        slam["id"] = f"slam-{SEASON}-{index:04d}"
        slam.pop("_batch", None)

    clubs = [
        {
            "id": SAI_CLUB_ID,
            "name": SAI_CLUB_NAME,
            "district": PROTOTYPE_DISTRICT,
            "contact": None,
            "notes": "Default club for Total slam sheet import.",
            "active": True,
        }
    ]
    return players, clubs, slams


def preview_table(df: pd.DataFrame, players: list[dict], slams: list[dict]) -> str:
    lines = [
        "| Rank | Player | Slug | Club W | Club B | State/YT W | State/YT B | Total | Events |",
        "|------|--------|------|--------|--------|------------|------------|-------|--------|",
    ]
    slam_counts = {}
    for slam in slams:
        slam_counts[slam["playerId"]] = slam_counts.get(slam["playerId"], 0) + 1

    for rank, (_, row) in enumerate(df.iterrows(), start=1):
        pid = slugify(row["Player"])
        lines.append(
            f"| {rank} | {row['Player']} | `{pid}` | {int(row['club_white'])} | {int(row['club_black'])} "
            f"| {int(row['state_white'])} | {int(row['state_black'])} | {int(row['total_slam'])} | {slam_counts.get(pid, 0)} |"
        )

    total_w = int(df["total_white"].sum())
    total_b = int(df["total_black"].sum())
    total_all = int(df["total_slam"].sum())
    lines.append(
        f"| | **TOTAL** | | **{int(df['club_white'].sum())}** | **{int(df['club_black'].sum())}** "
        f"| **{int(df['state_white'].sum())}** | **{int(df['state_black'].sum())}** | **{total_all}** | **{len(slams)}** |"
    )
    lines.append("")
    lines.append(f"**Players:** {len(players)} · **Slam events to create:** {len(slams)} · **Club:** {SAI_CLUB_NAME} · **Gender:** male · **District:** {PROTOTYPE_DISTRICT}")
    lines.append(f"**Sheet totals check:** {total_w} white, {total_b} black, {total_all} total slams")
    return "\n".join(lines)


def write_data(players: list[dict], clubs: list[dict], slams: list[dict]) -> None:
    today = date.today().isoformat()
    PLAYERS_FILE.write_text(
        json.dumps({"schemaVersion": 1, "lastUpdated": today, "players": players}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    CLUBS_FILE.write_text(
        json.dumps({"schemaVersion": 1, "lastUpdated": today, "clubs": clubs}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    SLAMS_FILE.write_text(
        json.dumps({"schemaVersion": 1, "lastUpdated": today, "slams": slams}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Total slam Excel sheet into v1 JSON data.")
    parser.add_argument("xlsx", nargs="?", default=str(XLSX_DEFAULT), help="Path to Excel workbook")
    parser.add_argument("--apply", action="store_true", help="Write data/*.json (default is preview only)")
    args = parser.parse_args()

    xlsx = Path(args.xlsx)
    if not xlsx.exists():
        print(f"Excel file not found: {xlsx}", file=sys.stderr)
        return 1

    df = load_total_slam_sheet(xlsx)
    players, clubs, slams = build_dataset(df)

    print(preview_table(df, players, slams))

    if args.apply:
        write_data(players, clubs, slams)
        print("\nWrote players.json, clubs.json, slams.json")
        print("Run: python scripts/validate_schema.py && python scripts/build_derived.py")
    else:
        print("\nPreview only — no files written. Re-run with `--apply` to import.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Import carrom slam data from Carrom records.xlsx into JSON data files."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Install pandas and openpyxl: pip install pandas openpyxl")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
XLSX_DEFAULT = ROOT / "Carrom records.xlsx"
TOTAL_OUTPUT = ROOT / "data" / "achievements.json"
STATE_OUTPUT = ROOT / "data/statecircuit.json"
STATIC_DIR = ROOT / "static" / "data"
SEASONS_OUTPUT = ROOT / "data" / "seasons.json"

META_COLS = {"Player", "Unnamed: 1", "District", "Total", "Club"}


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug or "player"


def int_val(value) -> int:
    if pd.isna(value):
        return 0
    return int(value)


def normalize_gender(value) -> str:
    return str(value or "male").strip().lower()


def normalize_district(value) -> str:
    text = str(value or "").strip()
    return text or "Unknown"


def parse_matrix_sheet(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    tournament_cols = [c for c in df.columns if c not in META_COLS]
    df = df.dropna(subset=["Player"])
    df = df[df["Player"].astype(str).str.strip() != ""]

    merged: dict[str, dict] = {}
    for _, row in df.iterrows():
        name = str(row["Player"]).strip()
        if name not in merged:
            merged[name] = {
                "Player": name,
                "Unnamed: 1": row.get("Unnamed: 1"),
                "District": row.get("District"),
                **{col: 0 for col in tournament_cols},
            }
        entry = merged[name]
        for col in tournament_cols:
            value = row.get(col)
            if pd.notna(value):
                entry[col] += int(value)
        if pd.notna(row.get("District")):
            entry["District"] = row.get("District")
        if pd.notna(row.get("Unnamed: 1")):
            entry["Unnamed: 1"] = row.get("Unnamed: 1")
        entry["Total"] = sum(entry[col] for col in tournament_cols)

    return pd.DataFrame(merged.values()), tournament_cols


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def copy_static(filename: str, data: dict) -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    target = STATIC_DIR / filename
    target.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  Also copied → {target}")


def update_seasons(year: int, last_updated: str) -> None:
    if SEASONS_OUTPUT.exists():
        seasons = json.loads(SEASONS_OUTPUT.read_text(encoding="utf-8"))
    else:
        seasons = {"defaultYear": year, "seasons": []}

    seasons["defaultYear"] = year
    found = False
    for entry in seasons.get("seasons", []):
        if entry.get("year") == year:
            entry["available"] = True
            entry["lastUpdated"] = last_updated
            entry["label"] = f"{year} Season"
            found = True
            break
    if not found:
        seasons.setdefault("seasons", []).append(
            {
                "year": year,
                "label": f"{year} Season",
                "available": True,
                "lastUpdated": last_updated,
            }
        )
    seasons["seasons"] = sorted(seasons["seasons"], key=lambda s: s["year"], reverse=True)
    write_json(SEASONS_OUTPUT, seasons)


def import_total_slam(xlsx: Path, year: int = 2025) -> dict:
    df = pd.read_excel(xlsx, sheet_name="Total slam", header=1)
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


def import_state_circuit(xlsx: Path, year: int = 2025) -> dict:
    white_df, white_cols = parse_matrix_sheet(pd.read_excel(xlsx, sheet_name="White slam", header=0))
    black_df, black_cols = parse_matrix_sheet(pd.read_excel(xlsx, sheet_name="Black slam", header=0))

    tournament_names = list(dict.fromkeys(white_cols + black_cols))
    tournaments = [{"id": slugify(name), "name": str(name).strip()} for name in tournament_names]
    tournament_ids = {t["name"]: t["id"] for t in tournaments}

    by_name: dict[str, dict] = {}

    def ingest(df: pd.DataFrame, cols: list[str], slam_key: str) -> None:
        for _, row in df.iterrows():
            name = str(row["Player"]).strip()
            if name not in by_name:
                by_name[name] = {
                    "name": name,
                    "gender": normalize_gender(row.get("Unnamed: 1")),
                    "district": normalize_district(row.get("District")),
                    "totals": {"white": 0, "black": 0, "all": 0},
                    "byTournament": {},
                }
            player = by_name[name]
            if pd.notna(row.get("District")):
                player["district"] = normalize_district(row.get("District"))
            if pd.notna(row.get("Unnamed: 1")):
                player["gender"] = normalize_gender(row.get("Unnamed: 1"))

            for col in cols:
                count = int_val(row.get(col))
                if count <= 0:
                    continue
                tid = tournament_ids[str(col).strip()]
                entry = player["byTournament"].setdefault(tid, {"white": 0, "black": 0})
                entry[slam_key] += count
                player["totals"][slam_key] += count

    ingest(white_df, white_cols, "white")
    ingest(black_df, black_cols, "black")

    players: list[dict] = []
    used_ids: set[str] = set()
    for pdata in by_name.values():
        pdata["totals"]["all"] = pdata["totals"]["white"] + pdata["totals"]["black"]
        if pdata["totals"]["all"] == 0:
            continue

        base_id = slugify(pdata["name"])
        player_id = base_id
        suffix = 2
        while player_id in used_ids:
            player_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(player_id)

        players.append(
            {
                "id": player_id,
                "name": pdata["name"],
                "gender": pdata["gender"],
                "district": pdata["district"],
                "displayOrder": 0,
                "totals": pdata["totals"],
                "byTournament": pdata["byTournament"],
            }
        )

    players.sort(key=lambda p: (-p["totals"]["all"], -p["totals"]["white"], p["name"]))
    for order, player in enumerate(players, start=1):
        player["displayOrder"] = order

    tournament_stats = []
    for tournament in tournaments:
        tid = tournament["id"]
        white = sum(p["byTournament"].get(tid, {}).get("white", 0) for p in players)
        black = sum(p["byTournament"].get(tid, {}).get("black", 0) for p in players)
        top_players = []
        for player in players:
            counts = player["byTournament"].get(tid, {"white": 0, "black": 0})
            total = counts["white"] + counts["black"]
            if total > 0:
                top_players.append(
                    {
                        "name": player["name"],
                        "white": counts["white"],
                        "black": counts["black"],
                        "total": total,
                    }
                )
        top_players.sort(key=lambda item: (-item["total"], -item["white"], item["name"]))
        tournament_stats.append(
            {
                **tournament,
                "totals": {"white": white, "black": black, "all": white + black},
                "topPlayers": top_players[:3],
            }
        )
    tournament_stats.sort(key=lambda t: (-t["totals"]["all"], t["name"]))

    district_stats_map: dict[str, dict] = defaultdict(lambda: {"white": 0, "black": 0, "players": 0})
    for player in players:
        district = player["district"]
        district_stats_map[district]["white"] += player["totals"]["white"]
        district_stats_map[district]["black"] += player["totals"]["black"]
        district_stats_map[district]["players"] += 1

    districts = []
    for name, stats in district_stats_map.items():
        districts.append(
            {
                "name": name,
                "players": stats["players"],
                "totals": {
                    "white": stats["white"],
                    "black": stats["black"],
                    "all": stats["white"] + stats["black"],
                },
            }
        )
    districts.sort(key=lambda d: (-d["totals"]["all"], d["name"]))

    total_white = sum(p["totals"]["white"] for p in players)
    total_black = sum(p["totals"]["black"] for p in players)

    return {
        "year": year,
        "lastUpdated": date.today().isoformat(),
        "summary": {
            "players": len(players),
            "tournaments": len(tournaments),
            "totals": {
                "white": total_white,
                "black": total_black,
                "all": total_white + total_black,
            },
        },
        "tournaments": tournament_stats,
        "districts": districts,
        "players": players,
    }


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else XLSX_DEFAULT
    if not xlsx.exists():
        print(f"Excel file not found: {xlsx}")
        return 1

    total_data = import_total_slam(xlsx)
    write_json(TOTAL_OUTPUT, total_data)
    copy_static("achievements.json", total_data)

    ts = total_data["summary"]
    print(f"Imported Total slam → {TOTAL_OUTPUT}")
    print(f"  Players: {len(total_data['players'])} · Totals: {ts['totals']['all']} slams")

    state_data = import_state_circuit(xlsx)
    write_json(STATE_OUTPUT, state_data)
    copy_static("statecircuit.json", state_data)

    ss = state_data["summary"]
    print(f"Imported White/Black slam → {STATE_OUTPUT}")
    print(f"  Players: {ss['players']} · Tournaments: {ss['tournaments']} · Totals: {ss['totals']['all']} slams")

    sys.path.insert(0, str(Path(__file__).parent))
    from build_players import PLAYERS_OUT, build_players

    players_data = build_players(xlsx)
    write_json(PLAYERS_OUT, players_data)
    copy_static("players.json", players_data)
    ps = players_data["summary"]
    print(f"Built player registry → {PLAYERS_OUT}")
    print(f"  {ps['players']} unified profiles")

    update_seasons(total_data["year"], total_data["lastUpdated"])
    print(f"Updated seasons → {SEASONS_OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

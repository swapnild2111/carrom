#!/usr/bin/env python3
"""Import 2025 carrom slam data from Carrom records.xlsx into data/achievements.json."""

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

META_COLS = {"Player", "Unnamed: 1", "District", "Total", "Club"}
MATCH_RE = re.compile(r"Match-\s*(\d+)\s*\|\s*SET-(\d+)\s*\|\s*Board-\s*(\d+)", re.I)

DISTRICT_ALIASES = {
    "mumbai sub": "Mumbai Sub",
    "mumbai suburban": "Mumbai Sub",
    "mumbai sub.": "Mumbai Sub",
}

NAME_ALIASES = {
    "mohammad ghufran": "Mohd. Ghufran",
    "modh ghufran": "Mohd. Ghufran",
    "mohd ghufran": "Mohd. Ghufran",
}


def normalize_player_key(name: str) -> str:
    n = name.lower().strip()
    n = re.sub(r"[.']", "", n)
    n = re.sub(r"\bmohd\b", "mohammed", n)
    n = re.sub(r"\bmodh\b", "mohammed", n)
    n = re.sub(r"\bmohammad\b", "mohammed", n)
    n = re.sub(r"\s+", " ", n)
    return n


def resolve_player_id(name: str, name_to_id: dict[str, str]) -> str | None:
    cleaned = name.strip()
    if cleaned in name_to_id:
        return name_to_id[cleaned]

    alias = NAME_ALIASES.get(normalize_player_key(cleaned))
    if alias and alias in name_to_id:
        return name_to_id[alias]

    target = normalize_player_key(cleaned)
    for player_name, player_id in name_to_id.items():
        if normalize_player_key(player_name) == target:
            return player_id

    return None


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug or "player"


def normalize_district(value: str) -> str:
    cleaned = value.strip()
    return DISTRICT_ALIASES.get(cleaned.lower(), cleaned)


def normalize_gender(value: str) -> str:
    return value.strip().lower()


def tournament_id(name: str) -> str:
    return slugify(name)


def parse_matrix_sheet(xlsx: Path, sheet_name: str) -> tuple[pd.DataFrame, list[str]]:
    df = pd.read_excel(xlsx, sheet_name=sheet_name, header=0)
    tournament_cols = [c for c in df.columns if c not in META_COLS]
    df = df.dropna(subset=["Player"])
    df = df[df["Player"].astype(str).str.strip() != ""]

    # Merge duplicate player rows (Excel occasionally repeats a name).
    merged_rows: dict[str, dict] = {}
    for _, row in df.iterrows():
        name = str(row["Player"]).strip()
        if name not in merged_rows:
            merged_rows[name] = {
                "Player": name,
                "Unnamed: 1": row.get("Unnamed: 1"),
                "District": row.get("District"),
                **{col: 0 for col in tournament_cols},
            }
        entry = merged_rows[name]
        for col in tournament_cols:
            value = row.get(col)
            if pd.notna(value):
                entry[col] = int(entry[col]) + int(value)
        if pd.notna(row.get("District")):
            entry["District"] = row.get("District")
        if pd.notna(row.get("Unnamed: 1")):
            entry["Unnamed: 1"] = row.get("Unnamed: 1")

    for entry in merged_rows.values():
        entry["Total"] = sum(entry[col] for col in tournament_cols)

    merged_df = pd.DataFrame(merged_rows.values())
    return merged_df, tournament_cols


def build_players(white_df: pd.DataFrame, black_df: pd.DataFrame) -> tuple[list[dict], dict[str, str]]:
    """Return players list and name->id map. Order by white slam total desc."""
    by_name: dict[str, dict] = {}

    for df in (white_df, black_df):
        for _, row in df.iterrows():
            name = str(row["Player"]).strip()
            if name not in by_name:
                by_name[name] = {
                    "name": name,
                    "gender": normalize_gender(str(row.get("Unnamed: 1", "male"))),
                    "district": normalize_district(str(row.get("District", ""))),
                    "white_total": 0,
                    "black_total": 0,
                }
            if df is white_df:
                by_name[name]["white_total"] = int(row.get("Total", 0) or 0)
            else:
                by_name[name]["black_total"] = int(row.get("Total", 0) or 0)

    ranked = sorted(
        by_name.values(),
        key=lambda p: (p["white_total"] + p["black_total"], p["white_total"], p["name"]),
        reverse=True,
    )

    players: list[dict] = []
    name_to_id: dict[str, str] = {}
    used_ids: set[str] = set()

    for order, pdata in enumerate(ranked, start=1):
        base_id = slugify(pdata["name"])
        player_id = base_id
        suffix = 2
        while player_id in used_ids:
            player_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(player_id)
        name_to_id[pdata["name"]] = player_id

        players.append(
            {
                "id": player_id,
                "name": pdata["name"],
                "gender": pdata["gender"],
                "district": pdata["district"],
                "displayOrder": order,
                "totals": {
                    "white": pdata["white_total"],
                    "black": pdata["black_total"],
                },
            }
        )

    return players, name_to_id


def build_tournaments(white_cols: list[str], black_cols: list[str]) -> list[dict]:
    seen: dict[str, str] = {}
    for name in white_cols + black_cols:
        name = str(name).strip()
        if name and name not in seen:
            seen[name] = tournament_id(name)
    return [{"id": tid, "name": name} for name, tid in seen.items()]


def build_matrix_rows(
    df: pd.DataFrame,
    tournament_cols: list[str],
    name_to_id: dict[str, str],
) -> list[dict]:
    rows: list[dict] = []
    for _, row in df.iterrows():
        name = str(row["Player"]).strip()
        player_id = name_to_id.get(name)
        if not player_id:
            continue
        counts: dict[str, int] = {}
        for col in tournament_cols:
            value = row.get(col)
            if pd.notna(value) and int(value) > 0:
                counts[tournament_id(str(col))] = int(value)
        if counts:
            rows.append({"playerId": player_id, "counts": counts})
    return rows


def parse_event_log(xlsx: Path, sheet_name: str, slam_type: str, name_to_id: dict[str, str]) -> list[dict]:
    df = pd.read_excel(xlsx, sheet_name=sheet_name, header=None)
    events: list[dict] = []
    event_num = 0
    i = 0

    while i < len(df):
        val = df.iloc[i, 0]
        if pd.isna(val):
            i += 1
            continue

        text = str(val).strip()
        if text.startswith("Match-") or (text.startswith("(") and text.endswith(")")):
            i += 1
            continue

        player_name = text
        i += 1
        district = ""
        match_detail = None

        if i < len(df):
            s2 = str(df.iloc[i, 0]).strip()
            if s2.startswith("(") and s2.endswith(")"):
                district = normalize_district(s2.strip("() "))
                i += 1

        if i < len(df):
            s3 = str(df.iloc[i, 0]).strip()
            match = MATCH_RE.match(s3)
            if match:
                match_detail = {
                    "number": int(match.group(1)),
                    "set": int(match.group(2)),
                    "board": int(match.group(3)),
                }
                i += 1

        player_id = resolve_player_id(player_name, name_to_id)
        if not player_id:
            player_id = slugify(player_name)
            print(f"Warning: unmatched event player {player_name!r} → {player_id}")

        event_num += 1
        events.append(
            {
                "id": f"evt-{event_num:03d}",
                "playerId": player_id,
                "slamType": slam_type,
                "tournamentId": None,
                "district": district or "",
                "match": match_detail,
                "notes": "",
            }
        )

    return events


def import_excel(xlsx: Path, year: int = 2025) -> dict:
    white_df, white_cols = parse_matrix_sheet(xlsx, "White slam")
    black_df, black_cols = parse_matrix_sheet(xlsx, "Black slam")

    players, name_to_id = build_players(white_df, black_df)
    tournaments = build_tournaments(white_cols, black_cols)

    slam_matrix = {
        "white": build_matrix_rows(white_df, white_cols, name_to_id),
        "black": build_matrix_rows(black_df, black_cols, name_to_id),
    }

    white_events = parse_event_log(xlsx, "white", "white", name_to_id)
    black_events = parse_event_log(xlsx, "black", "black", name_to_id)

    for index, event in enumerate(black_events, start=len(white_events) + 1):
        event["id"] = f"evt-{index:03d}"

    return {
        "year": year,
        "lastUpdated": date.today().isoformat(),
        "players": players,
        "tournaments": tournaments,
        "slamMatrix": slam_matrix,
        "slamEvents": white_events + black_events,
    }


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else XLSX_DEFAULT
    if not xlsx.exists():
        print(f"Excel file not found: {xlsx}")
        return 1

    data = import_excel(xlsx)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    white_sum = sum(p["totals"]["white"] for p in data["players"])
    black_sum = sum(p["totals"]["black"] for p in data["players"])
    print(f"Imported {xlsx.name} → {OUTPUT}")
    print(f"  Year: {data['year']}")
    print(f"  Players: {len(data['players'])}")
    print(f"  Tournaments: {len(data['tournaments'])}")
    print(f"  Matrix rows: {len(data['slamMatrix']['white'])} white, {len(data['slamMatrix']['black'])} black")
    print(f"  Events: {len(data['slamEvents'])} ({sum(1 for e in data['slamEvents'] if e['slamType']=='white')} white, {sum(1 for e in data['slamEvents'] if e['slamType']=='black')} black)")
    print(f"  Totals: {white_sum} white, {black_sum} black")
    return 0


if __name__ == "__main__":
    sys.exit(main())

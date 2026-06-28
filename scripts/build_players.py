#!/usr/bin/env python3
"""Build unified player registry from imported JSON + raw Excel sheets."""

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
ACHIEVEMENTS = ROOT / "data" / "achievements.json"
STATE_CIRCUIT = ROOT / "data" / "statecircuit.json"
PROFILES = ROOT / "data" / "player-profiles.json"
PLAYERS_OUT = ROOT / "data" / "players.json"
STATIC_DIR = ROOT / "static" / "data"
XLSX_DEFAULT = ROOT / "Carrom records.xlsx"

# Known name variants across Excel tabs (normalized key → canonical normalized key).
NAME_ALIASES: dict[str, str] = {
    "pankaj pawar": "pankaj ashok pawar",
    "modh ghufran": "mohd ghufran",
    "mohd ghufran": "mohd ghufran",
    "mohammad ghufran": "mohd ghufran",
    "sandeep dive": "sandip ashok dive",
    "siddhant wadwalkar": "siddhant mahendra wadwalkar",
    "hareshwar betwanshi": "hareshwar gangaprasad betvanshi",
    "shruti sonawane": "shruti sonawane",
    "zaid": "zaid ahmed farooquee",
}


def normalize_name_key(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^a-z0-9\s]", " ", ascii_name)
    return re.sub(r"\s+", " ", ascii_name).strip()


def canonical_key(name: str) -> str:
    key = normalize_name_key(name)
    return NAME_ALIASES.get(key, key)


def slugify(name: str) -> str:
    key = canonical_key(name)
    slug = re.sub(r"[^a-z0-9]+", "-", key).strip("-")
    return slug or "player"


def pick_display_name(names: set[str]) -> str:
    """Prefer the longest, most complete spelling."""
    return max(names, key=lambda n: (len(n), n))


def parse_event_log(xlsx: Path, sheet: str) -> dict[str, dict]:
    """Parse white/black event sheets → slam counts + location hints per player."""
    df = pd.read_excel(xlsx, sheet_name=sheet, header=None)
    counts: dict[str, dict] = defaultdict(lambda: {"white": 0, "black": 0, "locations": set(), "events": []})
    slam_type = "white" if sheet == "white" else "black"

    i = 0
    while i < len(df):
        cell = df.iloc[i, 0]
        if pd.isna(cell):
            i += 1
            continue
        text = str(cell).strip()
        if "Match-" in text:
            i += 1
            continue
        if text.startswith("(") and text.endswith(")"):
            i += 1
            continue
        if text in {"Name", "Count"}:
            i += 1
            continue

        player_name = text
        location = None
        if i + 1 < len(df):
            next_cell = df.iloc[i + 1, 0]
            if pd.notna(next_cell):
                next_text = str(next_cell).strip()
                if next_text.startswith("(") and next_text.endswith(")"):
                    location = next_text.strip("() ").strip()
                    i += 2
                else:
                    i += 1
            else:
                i += 1
        else:
            i += 1

        key = canonical_key(player_name)
        entry = counts[key]
        entry.setdefault("names", set()).add(player_name)
        entry[slam_type] += 1
        if location:
            entry.setdefault("locations", set()).add(location)

        if i < len(df) and pd.notna(df.iloc[i, 0]):
            maybe = str(df.iloc[i, 0]).strip()
            if "Match-" in maybe:
                entry.setdefault("events", []).append(
                    {"type": slam_type, "location": location, "ref": maybe}
                )
                i += 1

    result: dict[str, dict] = {}
    for key, data in counts.items():
        white = data.get("white", 0)
        black = data.get("black", 0)
        result[key] = {
            "white": white,
            "black": black,
            "all": white + black,
            "locations": sorted(data.get("locations", set())),
            "events": data.get("events", []),
            "names": sorted(data.get("names", set())),
        }
    return result


def parse_state_ranking(xlsx: Path) -> list[dict]:
    """Parse doubles podium placements from State ranking sheet."""
    df = pd.read_excel(xlsx, sheet_name="State ranking", header=0)
    podiums: list[dict] = []
    place_map = {"Winner": "1st", "Runner Up": "2nd", "3rd place": "3rd"}

    for row_idx, row in df.iterrows():
        for col, place in place_map.items():
            value = row.get(col)
            if pd.isna(value):
                continue
            name = str(value).strip()
            if not name:
                continue
            podiums.append(
                {
                    "name": name,
                    "place": place,
                    "category": "doubles",
                    "row": int(row_idx),
                }
            )
    return podiums


def compute_rank(values: list[tuple[str, int]]) -> dict[str, int]:
    """Rank by value descending; ties share rank."""
    sorted_items = sorted(values, key=lambda item: (-item[1], item[0]))
    ranks: dict[str, int] = {}
    prev_val = None
    prev_rank = 0
    for idx, (player_id, val) in enumerate(sorted_items, start=1):
        if val <= 0:
            continue
        if val != prev_val:
            prev_rank = idx
            prev_val = val
        ranks[player_id] = prev_rank
    return ranks


def build_players(xlsx: Path | None = None) -> dict:
    achievements = json.loads(ACHIEVEMENTS.read_text(encoding="utf-8"))
    state = json.loads(STATE_CIRCUIT.read_text(encoding="utf-8"))

    registry: dict[str, dict] = {}

    def ensure(key: str, display_name: str) -> dict:
        if key not in registry:
            registry[key] = {
                "names": set(),
                "profile": {"club": None, "district": None, "gender": None, "locations": set()},
                "totalSlams": None,
                "circuitSlams": None,
                "eventSlams": None,
                "podiums": [],
                "sources": set(),
            }
        registry[key]["names"].add(display_name)
        return registry[key]

    for player in achievements["players"]:
        key = canonical_key(player["name"])
        entry = ensure(key, player["name"])
        entry["sources"].add("totalSlams")
        entry["id"] = player["id"]
        if player.get("club"):
            entry["profile"]["club"] = player["club"]
        entry["totalSlams"] = {
            "club": player["slams"]["club"],
            "stateYoutube": player["slams"]["state"],
            "totals": player["totals"],
            "rank": player["displayOrder"],
        }

    for player in state["players"]:
        key = canonical_key(player["name"])
        entry = ensure(key, player["name"])
        entry["sources"].add("circuit")
        if "id" not in entry:
            entry["id"] = player["id"]
        entry["profile"]["district"] = player.get("district") or entry["profile"]["district"]
        entry["profile"]["gender"] = player.get("gender") or entry["profile"]["gender"]
        entry["circuitSlams"] = {
            "totals": player["totals"],
            "byTournament": player["byTournament"],
            "rank": player["displayOrder"],
        }

    if xlsx and xlsx.exists():
        for sheet in ("white", "black"):
            events = parse_event_log(xlsx, sheet)
            for key, data in events.items():
                entry = ensure(key, pick_display_name(set(data["names"])))
                entry["sources"].add("eventLog")
                for loc in data["locations"]:
                    entry["profile"]["locations"].add(loc)
                if entry["eventSlams"] is None:
                    entry["eventSlams"] = {"white": 0, "black": 0, "all": 0, "events": []}
                entry["eventSlams"]["white"] += data["white"]
                entry["eventSlams"]["black"] += data["black"]
                entry["eventSlams"]["all"] += data["all"]
                entry["eventSlams"]["events"].extend(data["events"])

        for podium in parse_state_ranking(xlsx):
            key = canonical_key(podium["name"])
            entry = ensure(key, podium["name"])
            entry["sources"].add("ranking")
            entry["podiums"].append(podium)

    if PROFILES.exists():
        profile_store = json.loads(PROFILES.read_text(encoding="utf-8"))
        for profile in profile_store.get("players", []):
            name = str(profile.get("name", "")).strip()
            if not name:
                continue
            key = canonical_key(name)
            entry = ensure(key, name)
            entry["sources"].add("profile")
            if profile.get("club"):
                entry["profile"]["club"] = profile["club"]
            if profile.get("district"):
                entry["profile"]["district"] = profile["district"]
            if profile.get("gender"):
                entry["profile"]["gender"] = profile["gender"]
            for alias in profile.get("aliases", []):
                alias_text = str(alias).strip()
                if alias_text:
                    entry["names"].add(alias_text)

    players_out: list[dict] = []
    used_ids: set[str] = set()

    for key, raw in registry.items():
        display_name = pick_display_name(raw["names"])
        aliases = sorted(n for n in raw["names"] if n != display_name)
        base_id = raw.get("id") or slugify(display_name)
        player_id = base_id
        suffix = 2
        while player_id in used_ids:
            player_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(player_id)

        total_all = (raw["totalSlams"] or {}).get("totals", {}).get("all", 0)
        circuit_all = (raw["circuitSlams"] or {}).get("totals", {}).get("all", 0)
        event_all = (raw["eventSlams"] or {}).get("all", 0)

        profile = {
            "club": raw["profile"]["club"],
            "district": raw["profile"]["district"],
            "gender": raw["profile"]["gender"],
            "locations": sorted(raw["profile"]["locations"]),
        }

        analytics = {
            "combinedSlamCount": max(total_all, circuit_all, event_all),
            "whiteSlamShare": None,
            "winRate": None,
            "lossRate": None,
            "podiumCount": len(raw["podiums"]),
            "dataCompleteness": sorted(raw["sources"]),
        }

        white_total = 0
        black_total = 0
        if raw["totalSlams"]:
            white_total = raw["totalSlams"]["totals"]["white"]
            black_total = raw["totalSlams"]["totals"]["black"]
        elif raw["circuitSlams"]:
            white_total = raw["circuitSlams"]["totals"]["white"]
            black_total = raw["circuitSlams"]["totals"]["black"]
        elif raw["eventSlams"]:
            white_total = raw["eventSlams"]["white"]
            black_total = raw["eventSlams"]["black"]

        slam_all = white_total + black_total
        if slam_all > 0:
            analytics["whiteSlamShare"] = round(white_total / slam_all, 3)

        players_out.append(
            {
                "id": player_id,
                "name": display_name,
                "aliases": aliases,
                "profile": profile,
                "achievements": {
                    "totalSlams": raw["totalSlams"],
                    "circuitSlams": raw["circuitSlams"],
                    "eventSlams": raw["eventSlams"],
                    "podiums": raw["podiums"],
                },
                "analytics": analytics,
            }
        )

    players_out.sort(key=lambda p: (-p["analytics"]["combinedSlamCount"], p["name"]))

    total_rank = compute_rank([(p["id"], p["achievements"]["totalSlams"]["totals"]["all"]) for p in players_out if p["achievements"]["totalSlams"]])
    circuit_rank = compute_rank([(p["id"], p["achievements"]["circuitSlams"]["totals"]["all"]) for p in players_out if p["achievements"]["circuitSlams"]])
    combined_rank = compute_rank([(p["id"], p["analytics"]["combinedSlamCount"]) for p in players_out])

    for player in players_out:
        pid = player["id"]
        player["analytics"]["ranks"] = {
            "combined": combined_rank.get(pid),
            "totalSlams": total_rank.get(pid),
            "circuitSlams": circuit_rank.get(pid),
        }
        player["displayOrder"] = combined_rank.get(pid, 999)

    players_out.sort(key=lambda p: (p["displayOrder"], p["name"]))

    with_club = sum(1 for p in players_out if p["profile"]["club"])
    with_district = sum(1 for p in players_out if p["profile"]["district"])
    with_total = sum(1 for p in players_out if p["achievements"]["totalSlams"])
    with_circuit = sum(1 for p in players_out if p["achievements"]["circuitSlams"])
    with_podium = sum(1 for p in players_out if p["achievements"]["podiums"])
    with_events = sum(1 for p in players_out if p["achievements"]["eventSlams"])

    return {
        "year": achievements.get("year", date.today().year),
        "lastUpdated": date.today().isoformat(),
        "summary": {
            "players": len(players_out),
            "withClub": with_club,
            "withDistrict": with_district,
            "withTotalSlams": with_total,
            "withCircuitSlams": with_circuit,
            "withEventSlams": with_events,
            "withPodiums": with_podium,
        },
        "analyticsNotes": {
            "winRate": "Requires match win/loss records (not in current Excel). Add columns: matches played, wins, losses.",
            "lossRate": "Same as winRate — slam counts alone do not capture losses.",
            "whiteSlamShare": "Share of a player's slams that were white slams (available now).",
            "combinedSlamCount": "Best available slam total across totalSlams, circuitSlams, or eventLog sources.",
        },
        "players": players_out,
    }


def main() -> int:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else XLSX_DEFAULT
    if not ACHIEVEMENTS.exists() or not STATE_CIRCUIT.exists():
        print("Run import_from_excel.py first.")
        return 1

    data = build_players(xlsx if xlsx.exists() else None)
    PLAYERS_OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    (STATIC_DIR / "players.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")

    s = data["summary"]
    print(f"Built player registry → {PLAYERS_OUT}")
    print(f"  {s['players']} players · club {s['withClub']} · district {s['withDistrict']}")
    print(f"  Sources: total {s['withTotalSlams']} · circuit {s['withCircuitSlams']} · events {s['withEventSlams']} · podiums {s['withPodiums']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Parse a GitHub Issue body (from add-slam template) and update achievements.json."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "achievements.json"

FIELD_PATTERN = re.compile(
    r"^### (?P<label>[^\n]+)\n+(?P<value>[^\n#]*(?:\n(?![#]).+)*)",
    re.MULTILINE,
)

SLAM_TYPE_MAP = {
    "white slam": "white",
    "black slam": "black",
    "white": "white",
    "black": "black",
}

TIER_MAP = {
    "club": "club",
    "state & youtube": "state",
    "state and youtube": "state",
    "state": "state",
}


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug or "player"


def parse_issue_body(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in FIELD_PATTERN.finditer(body):
        label = match.group("label").strip().lower()
        value = match.group("value").strip()
        fields[label] = value
    return fields


def find_player(players: list[dict], name: str) -> dict | None:
    target = name.strip().lower()
    for player in players:
        if player["name"].strip().lower() == target:
            return player
    return None


def next_display_order(players: list[dict]) -> int:
    return max((p["displayOrder"] for p in players), default=0) + 1


def recompute_summary(data: dict) -> None:
    club = {"white": 0, "black": 0}
    state = {"white": 0, "black": 0}
    for player in data["players"]:
        club["white"] += player["slams"]["club"]["white"]
        club["black"] += player["slams"]["club"]["black"]
        state["white"] += player["slams"]["state"]["white"]
        state["black"] += player["slams"]["state"]["black"]

    total_white = sum(p["totals"]["white"] for p in data["players"])
    total_black = sum(p["totals"]["black"] for p in data["players"])
    data["summary"] = {
        "club": club,
        "state": state,
        "totals": {
            "white": total_white,
            "black": total_black,
            "all": total_white + total_black,
        },
    }


def update_player_totals(player: dict) -> None:
    club = player["slams"]["club"]
    state = player["slams"]["state"]
    player["totals"]["white"] = club["white"] + state["white"]
    player["totals"]["black"] = club["black"] + state["black"]
    player["totals"]["all"] = player["totals"]["white"] + player["totals"]["black"]


def resort_players(players: list[dict]) -> None:
    players.sort(key=lambda p: (-p["totals"]["all"], -p["totals"]["white"], p["name"]))
    for order, player in enumerate(players, start=1):
        player["displayOrder"] = order


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: add_slam_from_issue.py <issue-body-file>")
        return 1

    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_body(body)

    player_name = fields.get("player name", "").strip()
    slam_type_raw = fields.get("slam type", "").strip().lower()
    tier_raw = fields.get("tournament tier", "").strip().lower()
    club_name = fields.get("club name (optional)", fields.get("club name", "")).strip()

    missing = [
        label
        for label, value in [
            ("Player name", player_name),
            ("Slam type", slam_type_raw),
            ("Tournament tier", tier_raw),
        ]
        if not value
    ]
    if missing:
        print("Missing required fields: " + ", ".join(missing))
        return 1

    slam_type = SLAM_TYPE_MAP.get(slam_type_raw)
    tier = TIER_MAP.get(tier_raw)
    if not slam_type:
        print(f"Invalid slam type: {slam_type_raw}")
        return 1
    if not tier:
        print(f"Invalid tier: {tier_raw}")
        return 1

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    player = find_player(data["players"], player_name)

    if player is None:
        base_slug = slugify(player_name)
        player_id = base_slug
        suffix = 2
        existing_ids = {p["id"] for p in data["players"]}
        while player_id in existing_ids:
            player_id = f"{base_slug}-{suffix}"
            suffix += 1

        player = {
            "id": player_id,
            "name": player_name,
            "club": club_name or None,
            "displayOrder": next_display_order(data["players"]),
            "slams": {
                "club": {"white": 0, "black": 0},
                "state": {"white": 0, "black": 0},
            },
            "totals": {"white": 0, "black": 0, "all": 0},
        }
        data["players"].append(player)
        print(f"Created new player: {player_name} ({player_id})")
    elif club_name and not player.get("club"):
        player["club"] = club_name

    player["slams"][tier][slam_type] += 1
    update_player_totals(player)
    resort_players(data["players"])
    recompute_summary(data)
    data["lastUpdated"] = date.today().isoformat()

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added 1 {slam_type} slam ({tier}) for {player_name} → total {player['totals']['all']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

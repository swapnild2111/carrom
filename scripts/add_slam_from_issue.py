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

FORMAT_MAP = {
    "singles": "singles",
    "doubles": "doubles",
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


def next_slam_id(slams: list[dict]) -> str:
    numbers = []
    for slam in slams:
        match = re.match(r"slam-(\d+)$", slam["id"])
        if match:
            numbers.append(int(match.group(1)))
    next_num = max(numbers, default=0) + 1
    return f"slam-{next_num:03d}"


def next_display_order(players: list[dict]) -> int:
    if not players:
        return 1
    return max(p["displayOrder"] for p in players) + 1


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: add_slam_from_issue.py <issue-body-file>")
        return 1

    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_body(body)

    player_name = fields.get("player name", "").strip()
    slam_type_raw = fields.get("slam type", "").strip().lower()
    format_raw = fields.get("tournament format", "").strip().lower()
    tournament = fields.get("tournament name", "").strip()
    date_str = fields.get("date", "").strip()
    notes = (
        fields.get("notes (optional)", "")
        or fields.get("notes", "")
    ).strip()

    missing = [
        label
        for label, value in [
            ("Player name", player_name),
            ("Slam type", slam_type_raw),
            ("Tournament format", format_raw),
            ("Tournament name", tournament),
            ("Date", date_str),
        ]
        if not value
    ]
    if missing:
        print("Missing required fields: " + ", ".join(missing))
        return 1

    slam_type = SLAM_TYPE_MAP.get(slam_type_raw)
    if not slam_type:
        print(f"Invalid slam type: {slam_type_raw}")
        return 1

    tournament_format = FORMAT_MAP.get(format_raw)
    if not tournament_format:
        print(f"Invalid tournament format: {format_raw}")
        return 1

    try:
        date.fromisoformat(date_str)
    except ValueError:
        print(f"Invalid date (use YYYY-MM-DD): {date_str}")
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
            "displayOrder": next_display_order(data["players"]),
        }
        data["players"].append(player)
        print(f"Created new player: {player_name} ({player_id})")

    new_slam = {
        "id": next_slam_id(data["slams"]),
        "playerId": player["id"],
        "slamType": slam_type,
        "format": tournament_format,
        "tournament": tournament,
        "date": date_str,
        "notes": notes,
    }
    data["slams"].append(new_slam)
    data["lastUpdated"] = date.today().isoformat()

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added {new_slam['id']} for {player_name}: {slam_type} {tournament_format} at {tournament}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

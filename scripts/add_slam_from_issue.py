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


def find_tournament(tournaments: list[dict], name: str) -> dict | None:
    target = name.strip().lower()
    for tournament in tournaments:
        if tournament["name"].strip().lower() == target:
            return tournament
    return None


def next_event_id(events: list[dict]) -> str:
    numbers = []
    for event in events:
        match = re.match(r"evt-(\d+)$", event["id"])
        if match:
            numbers.append(int(match.group(1)))
    return f"evt-{max(numbers, default=0) + 1:03d}"


def next_display_order(players: list[dict]) -> int:
    if not players:
        return 1
    return max(p["displayOrder"] for p in players) + 1


def get_matrix_row(matrix: list[dict], player_id: str) -> dict:
    for row in matrix:
        if row["playerId"] == player_id:
            return row
    row = {"playerId": player_id, "counts": {}}
    matrix.append(row)
    return row


def parse_match(fields: dict[str, str]) -> dict | None:
    number = fields.get("match number", "").strip()
    set_no = fields.get("set number", "").strip()
    board = fields.get("board number", "").strip()
    if not (number and set_no and board):
        return None
    return {"number": int(number), "set": int(set_no), "board": int(board)}


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: add_slam_from_issue.py <issue-body-file>")
        return 1

    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_body(body)

    player_name = fields.get("player name", "").strip()
    slam_type_raw = fields.get("slam type", "").strip().lower()
    tournament_name = fields.get("tournament name", "").strip()
    district = fields.get("district", "").strip()
    gender_raw = fields.get("gender", "male").strip().lower()
    notes = (fields.get("notes (optional)", "") or fields.get("notes", "")).strip()

    missing = [
        label
        for label, value in [
            ("Player name", player_name),
            ("Slam type", slam_type_raw),
            ("Tournament name", tournament_name),
            ("District", district),
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

    if gender_raw not in ("male", "female"):
        print(f"Invalid gender: {gender_raw}")
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
            "gender": gender_raw,
            "district": district,
            "displayOrder": next_display_order(data["players"]),
            "totals": {"white": 0, "black": 0},
        }
        data["players"].append(player)
        print(f"Created new player: {player_name} ({player_id})")

    tournament = find_tournament(data["tournaments"], tournament_name)
    if tournament is None:
        tournament = {"id": slugify(tournament_name), "name": tournament_name}
        data["tournaments"].append(tournament)
        print(f"Created new tournament: {tournament_name}")

    match = parse_match(fields)
    new_event = {
        "id": next_event_id(data["slamEvents"]),
        "playerId": player["id"],
        "slamType": slam_type,
        "tournamentId": tournament["id"],
        "district": district,
        "match": match,
        "notes": notes,
    }
    data["slamEvents"].append(new_event)

    matrix_row = get_matrix_row(data["slamMatrix"][slam_type], player["id"])
    matrix_row["counts"][tournament["id"]] = matrix_row["counts"].get(tournament["id"], 0) + 1
    player["totals"][slam_type] += 1
    data["lastUpdated"] = date.today().isoformat()

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added {new_event['id']} for {player_name}: {slam_type} at {tournament_name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

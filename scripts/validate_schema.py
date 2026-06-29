#!/usr/bin/env python3
"""Validate source and generated JSON data."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from lib import DATA, GENERATED, GENDERS, PROTOTYPE_DISTRICT, SLAM_SOURCES, SLAM_TYPES, slugify

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fail(errors: list[str]) -> int:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    return 1


def validate_players(players: list[dict], club_ids: set[str]) -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    for player in players:
        pid = player.get("id", "")
        if not SLUG_RE.match(pid):
            errors.append(f"player id invalid slug: {pid!r}")
        if pid in seen_ids:
            errors.append(f"duplicate player id: {pid}")
        seen_ids.add(pid)
        if player.get("district") != PROTOTYPE_DISTRICT:
            errors.append(f"player {pid}: district must be {PROTOTYPE_DISTRICT!r} in prototype")
        if player.get("gender") not in GENDERS:
            errors.append(f"player {pid}: invalid gender {player.get('gender')!r}")
        for cid in player.get("clubIds", []):
            if cid not in club_ids:
                errors.append(f"player {pid}: unknown clubId {cid!r}")
    return errors


def validate_clubs(clubs: list[dict]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for club in clubs:
        cid = club.get("id", "")
        if not SLUG_RE.match(cid):
            errors.append(f"club id invalid slug: {cid!r}")
        if cid in seen:
            errors.append(f"duplicate club id: {cid}")
        seen.add(cid)
        if slugify(club.get("name", "")) != cid:
            errors.append(f"club id {cid!r} does not match slug of name {club.get('name')!r}")
        if club.get("district") != PROTOTYPE_DISTRICT:
            errors.append(f"club {cid}: district must be {PROTOTYPE_DISTRICT!r}")
    return errors


def validate_slams(slams: list[dict], player_ids: set[str], club_ids: set[str]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for slam in slams:
        sid = slam.get("id", "")
        if sid in seen:
            errors.append(f"duplicate slam id: {sid}")
        seen.add(sid)
        if slam.get("playerId") not in player_ids:
            errors.append(f"slam {sid}: unknown playerId {slam.get('playerId')!r}")
        if slam.get("type") not in SLAM_TYPES:
            errors.append(f"slam {sid}: invalid type {slam.get('type')!r}")
        if slam.get("source") not in SLAM_SOURCES:
            errors.append(f"slam {sid}: invalid source {slam.get('source')!r}")
        if slam.get("source") == "club" and not slam.get("clubId"):
            errors.append(f"slam {sid}: clubId required when source is club")
        if slam.get("clubId") and slam.get("clubId") not in club_ids:
            errors.append(f"slam {sid}: unknown clubId {slam.get('clubId')!r}")
        if slam.get("date") and not DATE_RE.match(slam["date"]):
            errors.append(f"slam {sid}: invalid date {slam.get('date')!r}")
    return errors


def main() -> int:
    errors: list[str] = []

    players_data = load(DATA / "players.json")
    clubs_data = load(DATA / "clubs.json")
    slams_data = load(DATA / "slams.json")

    all_players = players_data.get("players", [])
    all_clubs = clubs_data.get("clubs", [])
    all_slams = slams_data.get("slams", [])

    players = [p for p in all_players if p.get("active", True)]
    clubs = [c for c in all_clubs if c.get("active", True)]
    slams = [s for s in all_slams if s.get("active", True)]

    club_ids = {c["id"] for c in all_clubs}
    player_ids = {p["id"] for p in all_players}

    errors.extend(validate_clubs(clubs))
    errors.extend(validate_players(players, club_ids))
    errors.extend(validate_slams(slams, player_ids, club_ids))

    if errors:
        return fail(errors)

    print("Validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

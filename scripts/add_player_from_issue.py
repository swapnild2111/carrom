#!/usr/bin/env python3
"""Parse a GitHub Issue body (add-player template) and update player-profiles.json."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROFILES_FILE = ROOT / "data" / "player-profiles.json"
ACHIEVEMENTS_FILE = ROOT / "data" / "achievements.json"

FIELD_PATTERN = re.compile(
    r"^### (?P<label>[^\n]+)\n+(?P<value>[^\n#]*(?:\n(?![#]).+)*)",
    re.MULTILINE,
)

GENDER_MAP = {
    "male": "male",
    "female": "female",
    "other": "other",
    "m": "male",
    "f": "female",
}


def parse_issue_body(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for match in FIELD_PATTERN.finditer(body):
        label = match.group("label").strip().lower()
        value = match.group("value").strip()
        fields[label] = value
    return fields


def normalize_gender(value: str) -> str | None:
    text = value.strip().lower()
    if not text:
        return None
    return GENDER_MAP.get(text)


def parse_aliases(value: str) -> list[str]:
    if not value.strip():
        return []
    return [part.strip() for part in re.split(r"[,;\n]+", value) if part.strip()]


def find_profile(profiles: list[dict], name: str) -> dict | None:
    target = name.strip().lower()
    for profile in profiles:
        if profile["name"].strip().lower() == target:
            return profile
        for alias in profile.get("aliases", []):
            if alias.strip().lower() == target:
                return profile
    return None


def sync_achievements_club(name: str, club: str | None) -> None:
    if not club or not ACHIEVEMENTS_FILE.exists():
        return
    data = json.loads(ACHIEVEMENTS_FILE.read_text(encoding="utf-8"))
    target = name.strip().lower()
    updated = False
    for player in data["players"]:
        if player["name"].strip().lower() == target:
            player["club"] = club
            updated = True
            break
    if updated:
        data["lastUpdated"] = date.today().isoformat()
        ACHIEVEMENTS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Synced club to achievements.json for {name}")


def rebuild_players_registry() -> None:
    sys.path.insert(0, str(Path(__file__).parent))
    from build_players import STATIC_DIR, build_players

    xlsx = ROOT / "Carrom records.xlsx"
    data = build_players(xlsx if xlsx.exists() else None)
    out = ROOT / "data" / "players.json"
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    (STATIC_DIR / "players.json").write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Rebuilt players registry → {out}")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: add_player_from_issue.py <issue-body-file>")
        return 1

    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_body(body)

    name = fields.get("full name", fields.get("player name", "")).strip()
    club = fields.get("club name", fields.get("club", "")).strip() or None
    district = fields.get("district / city", fields.get("district", "")).strip() or None
    gender_raw = fields.get("gender", "").strip()
    aliases_raw = fields.get("aliases (optional)", fields.get("aliases", ""))
    notes = fields.get("notes (optional)", fields.get("notes", "")).strip() or None

    if not name:
        print("Missing required field: Full name")
        return 1

    gender = normalize_gender(gender_raw)
    if gender_raw and not gender:
        print(f"Invalid gender: {gender_raw}")
        return 1

    if PROFILES_FILE.exists():
        store = json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
    else:
        store = {"lastUpdated": date.today().isoformat(), "players": []}

    profiles: list[dict] = store.setdefault("players", [])
    existing = find_profile(profiles, name)

    if existing:
        existing["name"] = name
        if club is not None:
            existing["club"] = club
        if district is not None:
            existing["district"] = district
        if gender is not None:
            existing["gender"] = gender
        if aliases_raw:
            existing["aliases"] = parse_aliases(aliases_raw)
        if notes is not None:
            existing["notes"] = notes
        print(f"Updated profile: {name}")
    else:
        profiles.append(
            {
                "name": name,
                "club": club,
                "district": district,
                "gender": gender,
                "aliases": parse_aliases(aliases_raw),
                "notes": notes,
            }
        )
        print(f"Added profile: {name}")

    profiles.sort(key=lambda p: p["name"].lower())
    store["lastUpdated"] = date.today().isoformat()
    PROFILES_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if club:
        sync_achievements_club(name, club)

    rebuild_players_registry()
    return 0


if __name__ == "__main__":
    sys.exit(main())

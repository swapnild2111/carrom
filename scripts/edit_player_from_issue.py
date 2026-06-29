#!/usr/bin/env python3
"""Parse edit-player issue to update or deactivate a player profile."""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from lib import DATA, parse_aliases, parse_club_ids, parse_issue_fields

PLAYERS_FILE = DATA / "players.json"


def main() -> int:
    body = Path(sys.argv[1]).read_text(encoding="utf-8")
    fields = parse_issue_fields(body)

    player_id = fields.get("player id", "").strip()
    if not player_id:
        print("Player id is required.", file=sys.stderr)
        return 1

    data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    players = data.get("players", [])
    player = next((p for p in players if p["id"] == player_id), None)
    if not player:
        print(f"Unknown player id: {player_id}", file=sys.stderr)
        return 1

    action = fields.get("action", "update").strip().lower()
    if action == "deactivate":
        player["active"] = False
    elif action == "update":
        if fields.get("full name", "").strip():
            player["name"] = fields["full name"].strip()
        if fields.get("gender", "").strip():
            gender = fields["gender"].strip().lower()
            if gender not in {"male", "female"}:
                print("Gender must be Male or Female.", file=sys.stderr)
                return 1
            player["gender"] = gender
        alias_value = None
        for key in ("aliases (optional)", "aliases (comma-separated)"):
            if key in fields:
                alias_value = fields.get(key, "")
                break
        if alias_value is not None:
            player["aliases"] = parse_aliases(alias_value)
        if "club ids (comma-separated)" in fields:
            player["clubIds"] = parse_club_ids(fields.get("club ids (comma-separated)", ""))
        restore = fields.get("restore (true/false)", "").strip().lower()
        if restore in {"true", "yes", "1"}:
            player["active"] = True
    else:
        print("Action must be update or deactivate.", file=sys.stderr)
        return 1

    data["lastUpdated"] = date.today().isoformat()
    PLAYERS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Processed player {player_id} ({action})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

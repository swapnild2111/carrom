#!/usr/bin/env python3
"""Validate data/achievements.json against data/schema.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("Install jsonschema: pip install jsonschema")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "achievements.json"
SCHEMA_FILE = ROOT / "data" / "schema.json"
STATE_FILE = ROOT / "data" / "statecircuit.json"
STATE_SCHEMA_FILE = ROOT / "data" / "statecircuit-schema.json"


def validate_file(data_file: Path, schema_file: Path, label: str) -> int:
    data = json.loads(data_file.read_text(encoding="utf-8"))
    schema = json.loads(schema_file.read_text(encoding="utf-8"))
    validator = jsonschema.Draft7Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    if errors:
        print(f"Validation failed for {data_file}:")
        for err in errors:
            path = ".".join(str(p) for p in err.path) or "(root)"
            print(f"  - {path}: {err.message}")
        return 1
    print(f"OK [{label}]: validated {data_file.name}")
    return 0


def main() -> int:
    if validate_file(DATA_FILE, SCHEMA_FILE, "total") != 0:
        return 1

    player_ids = {p["id"] for p in json.loads(DATA_FILE.read_text())["players"]}
    if len(player_ids) != len(json.loads(DATA_FILE.read_text())["players"]):
        print("Duplicate player ids in achievements.json.")
        return 1

    if STATE_FILE.exists() and STATE_SCHEMA_FILE.exists():
        if validate_file(STATE_FILE, STATE_SCHEMA_FILE, "state") != 0:
            return 1

    total = json.loads(DATA_FILE.read_text())
    s = total["summary"]["totals"]
    print(f"Totals: {s['all']} slams ({s['white']} white / {s['black']} black)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

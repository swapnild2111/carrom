#!/usr/bin/env python3
"""Export every Firestore collection to a single gzipped JSON file.

Structure of the output:
  {
    "takenAt": "2026-08-07T21:00:00Z",
    "project": "carrom-thane",
    "collections": {
      "players": [ {id, ...}, ... ],
      "clubs":   [ ... ],
      "slams":   [ ... ],
      "seasons": [ ... ],
      "admins":  [ ... ],
      "pending_admins_by_email": [ ... ],
      "audit_log": [ ... ]
    }
  }

To restore, feed the file back through migrate_json_to_firestore.py (which
accepts either data/*.json or an unpacked backup — Firestore timestamps get
serialized as ISO strings, which the migrate script handles.

Usage:
  export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
  python scripts/export_firestore_backup.py --project carrom-thane \
      --output backups/2026-08-07.json.gz
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

COLLECTIONS = [
    "players",
    "clubs",
    "slams",
    "seasons",
    "admins",
    "pending_admins_by_email",
    "audit_log",
]


def _serialize(value: Any) -> Any:
    """Convert Firestore-specific types (Timestamp, DocumentReference) to JSON-safe values."""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if hasattr(value, "path"):  # DocumentReference
        return {"__ref__": value.path}
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True, help="Path to .json.gz output file")
    args = parser.parse_args()

    firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": args.project})
    db = firestore.client()

    dump = {
        "takenAt": datetime.now(timezone.utc).isoformat(),
        "project": args.project,
        "collections": {},
    }

    for name in COLLECTIONS:
        rows = []
        for snap in db.collection(name).stream():
            data = _serialize(snap.to_dict() or {})
            data["id"] = snap.id
            rows.append(data)
        dump["collections"][name] = rows
        print(f"  {name}: {len(rows)} docs")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = out.stat().st_size / 1024
    print(f"✓ Wrote {out} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

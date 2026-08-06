#!/usr/bin/env python3
"""Seed Firestore from the legacy data/*.json files.

Usage:
    # Against the emulator (safe to run repeatedly):
    FIRESTORE_EMULATOR_HOST=localhost:8080 \\
        python scripts/migrate_json_to_firestore.py --project demo-carrom

    # Against the real project (Google Application Default Credentials required):
    python scripts/migrate_json_to_firestore.py --project carrom-thane

The script is IDEMPOTENT: doc IDs are the slam / player / club / season
slugs (matching the current filesystem paths), so re-running overwrites
each doc with the JSON's latest state. Nothing is deleted.

Every doc gets these audit fields written on the FIRST migration:
    createdBy = "migration-script"
    createdAt = <server timestamp>
    updatedBy = "migration-script"
    updatedAt = <server timestamp>

On subsequent runs, only updatedBy/updatedAt are refreshed (createdBy/At
are preserved). This matches the security rules' expectations for what
the SDK / admin console would enforce for a real user, but the migration
script uses the Admin SDK which bypasses rules.

Prereq: pip install firebase-admin (added to scripts/requirements.txt).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

MIGRATION_ACTOR = "migration-script"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def audit_fields(existing: dict | None, actor: str) -> dict:
    """Return audit fields for an upsert.

    On first insert: createdBy + createdAt + updatedBy + updatedAt all set to actor/now.
    On re-run: createdBy/createdAt preserved from existing doc; updatedBy/updatedAt refreshed.
    """
    from google.cloud.firestore import SERVER_TIMESTAMP  # local import so --help works without deps

    if existing and existing.get("createdBy"):
        return {
            "createdBy": existing["createdBy"],
            "createdAt": existing.get("createdAt"),
            "updatedBy": actor,
            "updatedAt": SERVER_TIMESTAMP,
        }
    return {
        "createdBy": actor,
        "createdAt": SERVER_TIMESTAMP,
        "updatedBy": actor,
        "updatedAt": SERVER_TIMESTAMP,
    }


def migrate_collection(db, collection_name: str, docs: list[dict], id_field: str, actor: str) -> int:
    """Upsert each doc in `docs` into `db.collection(collection_name)` keyed by `id_field`."""
    coll = db.collection(collection_name)
    count = 0
    for row in docs:
        doc_id = str(row[id_field])
        # Firestore doc IDs cannot contain / or start with __ ; our slugs never do.
        doc_ref = coll.document(doc_id)
        existing = doc_ref.get()
        existing_data = existing.to_dict() if existing.exists else None

        payload = {**row, **audit_fields(existing_data, actor)}
        # Strip the id_field from payload — it's already the doc ID.
        payload.pop(id_field, None)

        doc_ref.set(payload, merge=False)  # full-replace: JSON is source of truth
        count += 1
    return count


def migrate_admins(db, allowlist: dict, actor: str) -> int:
    """The admin allowlist uses GitHub usernames today. We can't map those to
    Firebase Auth UIDs automatically — those are minted on first sign-in.

    So we write a `pending_admins` collection keyed by GitHub username with
    a note. The seed_admin.py script handles the real /admins/{uid} population
    after each admin signs in for the first time.
    """
    from google.cloud.firestore import SERVER_TIMESTAMP

    pending = db.collection("pending_admins")
    count = 0
    for gh_user in allowlist.get("allowedUsers", []):
        pending.document(gh_user).set(
            {
                "githubUsername": gh_user,
                "note": (
                    "Migrated from data/admin-allowlist.json. "
                    "Run scripts/seed_admin.py <uid> <email> role=owner "
                    "after this user's first Firebase Auth sign-in."
                ),
                "migratedBy": actor,
                "migratedAt": SERVER_TIMESTAMP,
            },
            merge=True,
        )
        count += 1
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--project", required=True, help="Firebase project ID (e.g. carrom-thane or demo-carrom for emulator)")
    parser.add_argument("--actor", default=MIGRATION_ACTOR, help="Actor tag for audit fields")
    parser.add_argument("--dry-run", action="store_true", help="Report what would be written without touching Firestore")
    args = parser.parse_args()

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("firebase-admin not installed. Run: pip install firebase-admin", file=sys.stderr)
        return 1

    # Emulator mode: FIRESTORE_EMULATOR_HOST env var short-circuits real auth.
    is_emulator = bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))
    if is_emulator:
        print(f"→ Emulator mode (FIRESTORE_EMULATOR_HOST={os.environ['FIRESTORE_EMULATOR_HOST']})")
        firebase_admin.initialize_app(options={"projectId": args.project})
    else:
        print(f"→ Real project mode ({args.project}). Using Application Default Credentials.")
        try:
            firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": args.project})
        except Exception as e:
            print(f"Auth error: {e}", file=sys.stderr)
            print("Try: gcloud auth application-default login", file=sys.stderr)
            return 1

    if args.dry_run:
        print("→ Dry run — no writes will be made.")
        # Just tally row counts and exit.
        for name, path, key in [
            ("players", DATA / "players.json", "players"),
            ("clubs", DATA / "clubs.json", "clubs"),
            ("slams", DATA / "slams.json", "slams"),
        ]:
            n = len(load_json(path).get(key, []))
            print(f"  {name}: {n} rows")
        seasons = load_json(DATA / "seasons.json").get("seasons", [])
        print(f"  seasons: {len(seasons)} rows")
        allowlist = load_json(DATA / "admin-allowlist.json").get("allowedUsers", [])
        print(f"  pending_admins: {len(allowlist)} usernames")
        return 0

    db = firestore.client()

    total = 0

    players_data = load_json(DATA / "players.json").get("players", [])
    n = migrate_collection(db, "players", players_data, "id", args.actor)
    print(f"✓ players — wrote {n} docs")
    total += n

    clubs_data = load_json(DATA / "clubs.json").get("clubs", [])
    n = migrate_collection(db, "clubs", clubs_data, "id", args.actor)
    print(f"✓ clubs — wrote {n} docs")
    total += n

    slams_data = load_json(DATA / "slams.json").get("slams", [])
    n = migrate_collection(db, "slams", slams_data, "id", args.actor)
    print(f"✓ slams — wrote {n} docs")
    total += n

    seasons_data = load_json(DATA / "seasons.json").get("seasons", [])
    # Seasons use "year" as ID (stringified).
    seasons_with_id = [{**s, "id": str(s["year"])} for s in seasons_data]
    n = migrate_collection(db, "seasons", seasons_with_id, "id", args.actor)
    print(f"✓ seasons — wrote {n} docs")
    total += n

    allowlist = load_json(DATA / "admin-allowlist.json")
    n = migrate_admins(db, allowlist, args.actor)
    print(f"✓ pending_admins — wrote {n} docs (GitHub usernames; convert to /admins/{{uid}} after first sign-in)")
    total += n

    print(f"\nDone. {total} documents written to project '{args.project}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

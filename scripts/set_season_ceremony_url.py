#!/usr/bin/env python3
"""Set (or clear) the awards ceremony video URL for a season.

Usage:
  # Set the 2024 season's ceremony URL
  python scripts/set_season_ceremony_url.py --project carrom-thane \
      2024 https://www.youtube.com/watch?v=4VGrTfW7KZE

  # Clear it (pass empty string or the sentinel "none")
  python scripts/set_season_ceremony_url.py --project carrom-thane 2025 ""

The season doc must exist. Field is stored as `ceremonyVideoUrl` — matches
what the Season TypeScript schema expects.
"""

from __future__ import annotations

import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("year", type=int, help="Season start year, e.g. 2024")
    parser.add_argument("url", help='YouTube URL, or "" / "none" to clear')
    parser.add_argument("--project", required=True)
    args = parser.parse_args()

    firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": args.project})
    db = firestore.client()

    doc_ref = db.collection("seasons").document(str(args.year))
    snap = doc_ref.get()
    if not snap.exists:
        print(f"! Season {args.year} not found in Firestore.", file=sys.stderr)
        return 1

    value = None if args.url.strip().lower() in ("", "none") else args.url.strip()
    doc_ref.update({
        "ceremonyVideoUrl": value,
        "updatedBy": "ceremony-url-script",
        "updatedByEmail": "ceremony-url-script",
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    if value:
        print(f"✓ Set ceremonyVideoUrl for season {args.year}: {value}")
    else:
        print(f"✓ Cleared ceremonyVideoUrl for season {args.year}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

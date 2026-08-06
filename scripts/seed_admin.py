#!/usr/bin/env python3
"""Add a user to the /admins/{uid} collection.

After an admin signs in with Google for the first time on the site, Firebase
issues them a stable UID. Grab it from the Firebase console:
    Authentication → Users → click the row → copy "User UID".

Then:
    python scripts/seed_admin.py <UID> <email> --role owner --project carrom-thane

The `owner` role can write to /admins/{uid} itself (i.e. can promote / demote
other admins). Regular admins have role="editor" and can only touch data.

There must always be at least one owner in the project.
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("uid", help="Firebase Auth UID (from console → Authentication → Users)")
    p.add_argument("email", help="Admin's email — stored for readability")
    p.add_argument("--role", choices=["owner", "editor"], default="editor")
    p.add_argument("--display-name", default="", help="Optional display name")
    p.add_argument("--project", required=True)
    p.add_argument("--added-by", default="seed-script")
    args = p.parse_args()

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("firebase-admin not installed. Run: pip install firebase-admin", file=sys.stderr)
        return 1

    is_emulator = bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))
    if is_emulator:
        print(f"→ Emulator mode")
        firebase_admin.initialize_app(options={"projectId": args.project})
    else:
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": args.project})

    db = firestore.client()
    db.collection("admins").document(args.uid).set(
        {
            "email": args.email,
            "displayName": args.display_name or args.email,
            "role": args.role,
            "addedBy": args.added_by,
            "addedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    print(f"✓ Added {args.email} ({args.uid}) as {args.role} in project '{args.project}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Queue a new admin so they get promoted on their first Firebase sign-in.

The user must sign in with the SAME email you queue here. On sign-in the
Astro app finds `/pending_admins_by_email/{email}`, creates `/admins/{uid}`
using the queued role, and deletes the pending record.

Usage:
  export GOOGLE_APPLICATION_CREDENTIALS=~/.config/carrom-thane-admin.json
  python scripts/add_pending_admin.py --project carrom-thane \\
      prem123456q@gmail.com --role owner --display-name "Premkumar Mishra"

Roles: owner (can add/remove other admins), editor (can edit data only).
"""

from __future__ import annotations

import argparse
import sys

import firebase_admin
from firebase_admin import credentials, firestore


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", help="Admin's email — must match their Firebase sign-in")
    parser.add_argument("--role", choices=["owner", "editor"], default="editor")
    parser.add_argument("--display-name", default="")
    parser.add_argument("--project", required=True)
    parser.add_argument("--added-by", default="add-pending-admin-script")
    args = parser.parse_args()

    email = args.email.strip().lower()
    if "@" not in email:
        print(f"! {args.email} doesn't look like an email address.", file=sys.stderr)
        return 1

    firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": args.project})
    db = firestore.client()

    doc_ref = db.collection("pending_admins_by_email").document(email)
    doc_ref.set({
        "email": args.email,
        "role": args.role,
        "displayName": args.display_name,
        "addedBy": args.added_by,
        "addedAt": firestore.SERVER_TIMESTAMP,
    })
    print(f"✓ Queued {args.email} as {args.role}.")
    print(f"  They'll be auto-promoted on their next sign-in at /admin/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

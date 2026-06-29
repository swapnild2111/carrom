"""Unit tests for scripts/lib.py helpers."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lib import parse_aliases, parse_club_ids, parse_issue_fields, slugify  # noqa: E402


def test_slugify_basic():
    assert slugify("Kunal Raut") == "kunal-raut"
    assert slugify("Test Pack Club") == "test-pack-club"


def test_parse_issue_fields():
    body = "### Full name\n\nAlice\n\n### Gender\n\nFemale\n"
    fields = parse_issue_fields(body)
    assert fields["full name"] == "Alice"
    assert fields["gender"] == "Female"


def test_parse_aliases_and_clubs():
    assert parse_aliases("A, B; C") == ["A", "B", "C"]
    assert parse_club_ids("sai-carrom, other-club") == ["sai-carrom", "other-club"]
    assert parse_club_ids("") == []

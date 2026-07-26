#!/usr/bin/env python3
"""Shared helpers for carrom data pipeline."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env_path(key: str, default: Path) -> Path:
    override = os.environ.get(key)
    return Path(override) if override else default


DATA = _env_path("CARROM_DATA_DIR", ROOT / "data")
GENERATED = DATA / "generated"
CONTENT_PLAYERS = _env_path("CARROM_CONTENT_PLAYERS", ROOT / "content" / "players")
CONTENT_CLUBS = _env_path("CARROM_CONTENT_CLUBS", ROOT / "content" / "clubs")
STATIC_DATA = _env_path("CARROM_STATIC_DATA", ROOT / "static" / "data")

SLAM_TYPES = {"white", "black"}
SLAM_SOURCES = {"youtube", "club", "tournament"}
GENDERS = {"male", "female"}
PROTOTYPE_DISTRICT = "Thane"


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.strip().lower())
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^a-z0-9\s-]", " ", ascii_name)
    return re.sub(r"[-\s]+", "-", ascii_name).strip("-") or "player"


def parse_issue_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    current_label: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_label, current_lines
        if current_label is not None:
            fields[current_label] = "\n".join(current_lines).strip()
        current_label = None
        current_lines = []

    for line in body.splitlines():
        if line.startswith("### "):
            flush()
            current_label = line[4:].strip().lower()
        elif current_label is not None:
            current_lines.append(line)
    flush()
    return fields


def parse_aliases(value: str) -> list[str]:
    if not value.strip():
        return []
    return [part.strip() for part in re.split(r"[,;\n]+", value) if part.strip()]


def parse_club_ids(value: str) -> list[str]:
    if not value.strip():
        return []
    return [part.strip() for part in re.split(r"[,;\n]+", value) if part.strip()]


def load_seasons() -> dict:
    return json.loads((DATA / "seasons.json").read_text(encoding="utf-8"))


def resolve_season(on_date: date | None = None, seasons: dict | None = None) -> int:
    """Return the fiscal-year starting-year integer for on_date (defaults to today).

    Fiscal year runs Apr 1 – Mar 31; season "2025" means Apr 2025 – Mar 2026.
    If on_date falls outside any defined season, returns the closest available year.
    """
    on_date = on_date or date.today()
    seasons_data = seasons or load_seasons()
    entries = seasons_data.get("seasons", [])

    for entry in entries:
        start = date.fromisoformat(entry["start"])
        end = date.fromisoformat(entry["end"])
        if start <= on_date <= end:
            return int(entry["year"])

    if entries:
        latest = max(entries, key=lambda e: date.fromisoformat(e["start"]))
        return int(latest["year"])
    return on_date.year if on_date.month >= 4 else on_date.year - 1


def season_from_year_month(year: int, month: int) -> int:
    """Return fiscal-year starting-year for a given calendar year/month."""
    return year if month >= 4 else year - 1


def available_seasons(seasons: dict | None = None) -> list[dict]:
    data = seasons or load_seasons()
    return [s for s in data.get("seasons", []) if s.get("available", True)]

#!/usr/bin/env python3
"""Shared helpers for carrom data pipeline."""

from __future__ import annotations

import os
import re
import unicodedata
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

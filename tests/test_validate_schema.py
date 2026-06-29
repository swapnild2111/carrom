"""Validate production source data in the repo."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_repo_data_passes_validation():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "validate_schema.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

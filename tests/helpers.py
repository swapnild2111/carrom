"""Test helpers for admin pipeline E2E tests."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
ISSUES = FIXTURES / "issues"


def run_script(script_name: str, issue_path: Path, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script_name), str(issue_path)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def run_pipeline(script_name: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPTS / script_name)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def make_isolated_env(tmp_path: Path) -> dict[str, object]:
    data_dir = tmp_path / "data"
    generated = data_dir / "generated"
    generated.mkdir(parents=True)

    for name in ("players.json", "clubs.json", "slams.json", "seasons.json"):
        shutil.copy(FIXTURES / "data" / name, data_dir / name)

    content_players = tmp_path / "content" / "players"
    content_clubs = tmp_path / "content" / "clubs"
    static_data = tmp_path / "static" / "data"
    content_players.mkdir(parents=True)
    content_clubs.mkdir(parents=True)
    static_data.mkdir(parents=True)

    env = os.environ.copy()
    env["CARROM_DATA_DIR"] = str(data_dir)
    env["CARROM_CONTENT_PLAYERS"] = str(content_players)
    env["CARROM_CONTENT_CLUBS"] = str(content_clubs)
    env["CARROM_STATIC_DATA"] = str(static_data)

    return {
        "env": env,
        "data_dir": data_dir,
        "generated": generated,
        "static_data": static_data,
        "content_players": content_players,
        "content_clubs": content_clubs,
    }


def apply_issue(isolated_env: dict, script: str, issue_file: str) -> None:
    env = isolated_env["env"]
    result = run_script(script, ISSUES / issue_file, env)
    assert result.returncode == 0, f"{script} failed:\n{result.stderr}\n{result.stdout}"


def assert_validate_and_build(isolated_env: dict) -> None:
    env = isolated_env["env"]
    validate = run_pipeline("validate_schema.py", env)
    assert validate.returncode == 0, validate.stderr
    build = run_pipeline("build_derived.py", env)
    assert build.returncode == 0, build.stderr
    validate2 = run_pipeline("validate_schema.py", env)
    assert validate2.returncode == 0, validate2.stderr

"""End-to-end tests for all admin issue → data pipeline workflows."""

from __future__ import annotations

import json

from helpers import ISSUES, apply_issue, assert_validate_and_build, load_json, run_script


def test_add_club_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    clubs = load_json(isolated_env["data_dir"] / "clubs.json")["clubs"]
    assert len(clubs) == 1
    assert clubs[0]["id"] == "test-pack-club"
    assert clubs[0]["name"] == "Test Pack Club"
    assert_validate_and_build(isolated_env)


def test_add_player_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    players = load_json(isolated_env["data_dir"] / "players.json")["players"]
    player = next(p for p in players if p["id"] == "test-pack-player")
    assert player["name"] == "Test Pack Player"
    assert player["clubIds"] == ["test-pack-club"]
    assert player["aliases"] == ["TPP", "Pack"]
    assert_validate_and_build(isolated_env)


def test_add_slam_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    apply_issue(isolated_env, "add_slam_from_issue.py", "add-slam.md")
    slams = load_json(isolated_env["data_dir"] / "slams.json")["slams"]
    assert len(slams) == 1
    slam = slams[0]
    assert slam["id"] == "slam-2025-001"
    assert slam["playerId"] == "test-pack-player"
    assert slam["type"] == "white"
    assert slam["source"] == "club"
    assert slam["clubId"] == "test-pack-club"
    assert_validate_and_build(isolated_env)


def test_edit_player_update_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    apply_issue(isolated_env, "edit_player_from_issue.py", "edit-player-update.md")
    players = load_json(isolated_env["data_dir"] / "players.json")["players"]
    player = next(p for p in players if p["id"] == "test-pack-player")
    assert player["name"] == "Test Pack Player Updated"
    assert player["gender"] == "female"
    assert player["aliases"] == ["TPP", "Updated"]
    assert_validate_and_build(isolated_env)


def test_edit_player_deactivate_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    apply_issue(isolated_env, "edit_player_from_issue.py", "edit-player-deactivate.md")
    players = load_json(isolated_env["data_dir"] / "players.json")["players"]
    player = next(p for p in players if p["id"] == "test-pack-player")
    assert player["active"] is False
    assert_validate_and_build(isolated_env)


def test_edit_slam_update_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    apply_issue(isolated_env, "add_slam_from_issue.py", "add-slam.md")
    apply_issue(isolated_env, "edit_slam_from_issue.py", "edit-slam-update.md")
    slams = load_json(isolated_env["data_dir"] / "slams.json")["slams"]
    slam = slams[0]
    assert slam["type"] == "black"
    assert slam["notes"] == "Updated by E2E test pack"
    assert_validate_and_build(isolated_env)


def test_edit_slam_delete_workflow(isolated_env):
    apply_issue(isolated_env, "add_club_from_issue.py", "add-club.md")
    apply_issue(isolated_env, "add_player_from_issue.py", "add-player.md")
    apply_issue(isolated_env, "add_slam_from_issue.py", "add-slam.md")
    apply_issue(isolated_env, "edit_slam_from_issue.py", "edit-slam-delete.md")
    slams = load_json(isolated_env["data_dir"] / "slams.json")["slams"]
    assert slams[0]["active"] is False
    assert_validate_and_build(isolated_env)


def test_full_admin_lifecycle(isolated_env):
    """Run every admin workflow in sequence — mirrors real operator flow."""
    steps = [
        ("add_club_from_issue.py", "add-club.md"),
        ("add_player_from_issue.py", "add-player.md"),
        ("add_slam_from_issue.py", "add-slam.md"),
        ("edit_slam_from_issue.py", "edit-slam-update.md"),
        ("edit_player_from_issue.py", "edit-player-update.md"),
        ("edit_slam_from_issue.py", "edit-slam-delete.md"),
        ("edit_player_from_issue.py", "edit-player-deactivate.md"),
    ]
    for script, issue in steps:
        apply_issue(isolated_env, script, issue)

    data_dir = isolated_env["data_dir"]
    players = load_json(data_dir / "players.json")["players"]
    slams = load_json(data_dir / "slams.json")["slams"]
    clubs = load_json(data_dir / "clubs.json")["clubs"]

    assert len(clubs) == 1
    assert clubs[0]["id"] == "test-pack-club"
    assert any(p["id"] == "test-pack-player" and p["active"] is False for p in players)
    assert slams[0]["active"] is False
    assert slams[0]["type"] == "black"

    assert_validate_and_build(isolated_env)

    generated = isolated_env["generated"]
    assert (generated / "leaderboard_2025.json").exists()
    assert (generated / "site_summary.json").exists()
    assert list(isolated_env["content_clubs"].glob("*.md"))
    assert (isolated_env["static_data"] / "players.json").exists()
    assert (isolated_env["static_data"] / "slams.json").exists()


def test_issue_templates_use_parseable_labels():
    """GitHub issue template fixtures must use labels scripts understand."""
    template_checks = {
        "add-club.md": ["club name"],
        "add-player.md": ["full name", "gender"],
        "add-slam.md": ["player id", "slam type", "source"],
        "edit-player-update.md": ["player id", "action", "aliases (optional)"],
        "edit-slam-update.md": ["slam id", "action", "notes"],
    }
    for filename, required in template_checks.items():
        body = (ISSUES / filename).read_text(encoding="utf-8").lower()
        for label in required:
            assert f"### {label}" in body, f"{filename} missing ### {label}"


def test_unknown_player_rejected(isolated_env):
    result = run_script("add_slam_from_issue.py", ISSUES / "add-slam.md", isolated_env["env"])
    assert result.returncode != 0

#!/usr/bin/env python3
"""Build derived JSON and Hugo content from source data files."""

from __future__ import annotations

import json
import shutil
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from lib import (
    CONTENT_CLUBS,
    CONTENT_PLAYERS,
    DATA,
    GENERATED,
    ROOT,
    STATIC_DATA,
    available_seasons,
    load_seasons,
    resolve_season,
)

AWARDS_VIDEO = "https://www.youtube.com/watch?v=4VGrTfW7KZE"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def active_slams(slams: list[dict], season: int) -> list[dict]:
    return [
        s for s in slams
        if s.get("active", True) and s.get("season") == season
    ]


def group_timeline(timeline: list[dict]) -> list[dict]:
    """Collapse identical aggregate slams; keep dated or annotated events separate."""
    buckets: dict[tuple, dict] = {}
    standalone: list[dict] = []

    for slam in timeline:
        has_detail = bool(
            slam.get("date")
            or slam.get("videoUrl")
            or slam.get("matchRef")
            or slam.get("notes")
        )
        if has_detail:
            standalone.append({**slam, "count": 1})
            continue

        key = (
            slam["type"],
            slam["source"],
            slam.get("clubId"),
            slam.get("tournament"),
            slam.get("location"),
        )
        if key in buckets:
            buckets[key]["count"] += 1
        else:
            buckets[key] = {**slam, "count": 1}

    grouped = list(buckets.values()) + standalone
    grouped.sort(key=lambda g: (-g["count"], g["type"], g.get("date") or "", g["id"]))
    return grouped


def compute_player_stats(player_id: str, slams: list[dict]) -> dict:
    player_slams = [s for s in slams if s["playerId"] == player_id]
    white = sum(1 for s in player_slams if s["type"] == "white")
    black = sum(1 for s in player_slams if s["type"] == "black")
    by_source: dict[str, int] = defaultdict(int)
    by_club: dict[str, int] = defaultdict(int)
    for slam in player_slams:
        by_source[slam["source"]] += 1
        if slam.get("clubId"):
            by_club[slam["clubId"]] += 1
    timeline = sorted(
        player_slams,
        key=lambda s: (s.get("date") or "", s["id"]),
        reverse=True,
    )
    return {
        "white": white,
        "black": black,
        "total": white + black,
        "bySource": dict(by_source),
        "byClub": dict(by_club),
        "slamCount": len(player_slams),
        "timeline": timeline,
        "timelineGroups": group_timeline(timeline),
    }


def assign_ranks(players_stats: list[dict], key: str) -> None:
    sorted_players = sorted(players_stats, key=lambda p: (-p["stats"][key], p["name"].lower()))
    rank = 0
    last_value = None
    for index, entry in enumerate(sorted_players, start=1):
        value = entry["stats"][key]
        if value != last_value:
            rank = index
            last_value = value
        entry["ranks"][key] = rank if value > 0 else None


def build_awards(leaderboard: list[dict], season: int) -> dict:
    def winners(metric: str) -> list[dict]:
        if not leaderboard:
            return []
        best = max(p["stats"][metric] for p in leaderboard)
        if best == 0:
            return []
        return [
            {
                "playerId": p["id"],
                "name": p["name"],
                "slug": p["id"],
                "count": p["stats"][metric],
            }
            for p in leaderboard
            if p["stats"][metric] == best
        ]

    return {
        "season": season,
        "ceremonyVideoUrl": AWARDS_VIDEO,
        "maxWhiteSlams": winners("white"),
        "maxBlackSlams": winners("black"),
    }


def write_content_page(directory: Path, slug: str, title: str, entity_id: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{slug}.md"
    content = (
        f"---\n"
        f"title: {json.dumps(title)}\n"
        f"entityId: {json.dumps(entity_id)}\n"
        f"---\n"
    )
    path.write_text(content, encoding="utf-8")


def sync_static_data() -> None:
    STATIC_DATA.mkdir(parents=True, exist_ok=True)
    for name in ("seasons.json", "clubs.json", "players.json", "slams.json", "admin-allowlist.json"):
        src = DATA / name
        if src.exists():
            shutil.copy2(src, STATIC_DATA / name)
    if GENERATED.exists():
        static_generated = STATIC_DATA / "generated"
        if static_generated.exists():
            shutil.rmtree(static_generated)
        static_generated.mkdir(parents=True)
        for path in GENERATED.glob("*.json"):
            shutil.copy2(path, static_generated / path.name)


def compute_all_time_leaders(players: list[dict], all_slams: list[dict]) -> dict:
    """Top players across every season combined (all active slams from any season)."""
    active = [s for s in all_slams if s.get("active", True)]
    players_by_id = {p["id"]: p for p in players}

    per_player: dict[str, dict[str, int]] = {}
    for slam in active:
        pid = slam.get("playerId")
        if not pid or pid not in players_by_id:
            continue
        entry = per_player.setdefault(pid, {"white": 0, "black": 0, "total": 0})
        if slam["type"] == "white":
            entry["white"] += 1
        elif slam["type"] == "black":
            entry["black"] += 1
        entry["total"] = entry["white"] + entry["black"]

    def top_by(metric: str) -> list[dict]:
        if not per_player:
            return []
        best = max(e[metric] for e in per_player.values())
        if best == 0:
            return []
        return sorted(
            [
                {
                    "id": pid,
                    "name": players_by_id[pid]["name"],
                    "count": e[metric],
                }
                for pid, e in per_player.items()
                if e[metric] == best
            ],
            key=lambda w: w["name"].lower(),
        )

    return {
        "topTotal": top_by("total"),
        "topWhite": top_by("white"),
        "topBlack": top_by("black"),
        "totalSlams": sum(e["total"] for e in per_player.values()),
        "playerCount": len(per_player),
    }


def build_season_bundle(
    season: int,
    players: list[dict],
    clubs: list[dict],
    all_slams: list[dict],
) -> dict:
    """Compute per-season enriched players, clubs, leaderboard, awards, and summary."""
    slams = active_slams(all_slams, season)
    clubs_by_id = {c["id"]: c for c in clubs}

    enriched_players = []
    for player in players:
        stats = compute_player_stats(player["id"], slams)
        player_clubs = [
            {"id": cid, "name": clubs_by_id[cid]["name"]}
            for cid in player.get("clubIds", [])
            if cid in clubs_by_id
        ]
        enriched_players.append({
            **player,
            "clubs": player_clubs,
            "stats": {
                "white": stats["white"],
                "black": stats["black"],
                "total": stats["total"],
                "bySource": stats["bySource"],
                "byClub": stats["byClub"],
            },
            "ranks": {},
            "timeline": stats["timeline"],
            "timelineGroups": stats["timelineGroups"],
        })

    assign_ranks(enriched_players, "white")
    assign_ranks(enriched_players, "black")
    assign_ranks(enriched_players, "total")

    leaderboard = sorted(
        enriched_players,
        key=lambda p: (-p["stats"]["total"], -p["stats"]["white"], p["name"].lower()),
    )

    enriched_clubs = []
    for club in clubs:
        roster_players = [p for p in enriched_players if club["id"] in p.get("clubIds", [])]
        club_slams = [s for s in slams if s.get("clubId") == club["id"]]
        white = sum(1 for s in club_slams if s["type"] == "white")
        black = sum(1 for s in club_slams if s["type"] == "black")

        roster = []
        for player in roster_players:
            player_slams = [s for s in club_slams if s["playerId"] == player["id"]]
            pw = sum(1 for s in player_slams if s["type"] == "white")
            pb = sum(1 for s in player_slams if s["type"] == "black")
            roster.append({
                "id": player["id"],
                "name": player["name"],
                "white": pw,
                "black": pb,
                "total": pw + pb,
            })
        roster.sort(key=lambda r: (-r["total"], -r["white"], r["name"].lower()))

        enriched_clubs.append({
            **club,
            "roster": roster,
            "stats": {"white": white, "black": black, "total": white + black, "slamCount": len(club_slams)},
            "slams": sorted(club_slams, key=lambda s: (s.get("date") or "", s["id"]), reverse=True),
        })

    awards = build_awards(leaderboard, season)

    return {
        "season": season,
        "slams": slams,
        "enriched_players": enriched_players,
        "enriched_clubs": enriched_clubs,
        "leaderboard": leaderboard,
        "awards": awards,
        "totals": {
            "white": sum(s["type"] == "white" for s in slams),
            "black": sum(s["type"] == "black" for s in slams),
            "all": len(slams),
        },
    }


def main() -> int:
    players_data = load_json(DATA / "players.json")
    clubs_data = load_json(DATA / "clubs.json")
    slams_data = load_json(DATA / "slams.json")
    seasons_data = load_seasons()

    players = [p for p in players_data["players"] if p.get("active", True)]
    clubs = [c for c in clubs_data["clubs"] if c.get("active", True)]
    all_slams = slams_data["slams"]

    seasons = available_seasons(seasons_data)
    if not seasons:
        print("ERROR: no available seasons defined in seasons.json", file=sys.stderr)
        return 1

    current_season = resolve_season(seasons=seasons_data)
    today = date.today().isoformat()

    bundles: dict[int, dict] = {}
    for season_entry in seasons:
        year = int(season_entry["year"])
        bundles[year] = build_season_bundle(year, players, clubs, all_slams)

    current_bundle = bundles.get(current_season) or next(iter(bundles.values()))

    # Landing season: the season whose data drives the default home-page view.
    # Prefer today's fiscal-year season, but fall back to the newest season
    # with actual slams so visitors don't land on an empty leaderboard.
    if current_bundle["totals"]["all"] > 0:
        landing_season = current_season
    else:
        seasons_with_data = sorted(
            (y for y, b in bundles.items() if b["totals"]["all"] > 0),
            reverse=True,
        )
        landing_season = seasons_with_data[0] if seasons_with_data else current_season

    all_time = compute_all_time_leaders(players, all_slams)
    save_json(GENERATED / "all_time_leaders.json", {**all_time, "lastUpdated": today})

    for year, bundle in bundles.items():
        save_json(GENERATED / f"leaderboard-{year}.json", {
            "season": year,
            "district": "Thane",
            "lastUpdated": today,
            "players": bundle["leaderboard"],
        })
        save_json(GENERATED / f"awards-{year}.json", {**bundle["awards"], "lastUpdated": today})
        save_json(GENERATED / f"players_enriched-{year}.json", {
            "schemaVersion": 1,
            "season": year,
            "lastUpdated": today,
            "players": bundle["enriched_players"],
        })
        save_json(GENERATED / f"clubs_enriched-{year}.json", {
            "schemaVersion": 1,
            "season": year,
            "lastUpdated": today,
            "clubs": bundle["enriched_clubs"],
        })

    landing_bundle = bundles.get(landing_season) or current_bundle

    site_summary = {
        "season": landing_season,
        "currentSeason": current_season,
        "landingSeason": landing_season,
        "lastUpdated": today,
        "district": "Thane",
        "playerCount": len(landing_bundle["enriched_players"]),
        "clubCount": len(landing_bundle["enriched_clubs"]),
        "slamCount": len(landing_bundle["slams"]),
        "totals": landing_bundle["totals"],
        "seasons": [
            {
                "year": int(s["year"]),
                "label": s["label"],
                "start": s["start"],
                "end": s["end"],
                "slamCount": bundles[int(s["year"])]["totals"]["all"],
                "white": bundles[int(s["year"])]["totals"]["white"],
                "black": bundles[int(s["year"])]["totals"]["black"],
            }
            for s in seasons
            if int(s["year"]) in bundles
        ],
        "allTime": all_time,
    }
    save_json(GENERATED / "site_summary.json", site_summary)

    save_json(GENERATED / "leaderboard.json", {
        "season": landing_season,
        "district": "Thane",
        "lastUpdated": today,
        "players": landing_bundle["leaderboard"],
    })
    save_json(GENERATED / "awards.json", {**landing_bundle["awards"], "lastUpdated": today})
    save_json(GENERATED / "players_enriched.json", {
        "schemaVersion": 1,
        "season": landing_season,
        "lastUpdated": today,
        "players": landing_bundle["enriched_players"],
    })
    save_json(GENERATED / "clubs_enriched.json", {
        "schemaVersion": 1,
        "season": landing_season,
        "lastUpdated": today,
        "clubs": current_bundle["enriched_clubs"],
    })

    if CONTENT_PLAYERS.exists():
        shutil.rmtree(CONTENT_PLAYERS)
    if CONTENT_CLUBS.exists():
        shutil.rmtree(CONTENT_CLUBS)

    for player in current_bundle["enriched_players"]:
        write_content_page(CONTENT_PLAYERS, player["id"], player["name"], player["id"])

    for club in current_bundle["enriched_clubs"]:
        write_content_page(CONTENT_CLUBS, club["id"], club["name"], club["id"])

    awards_dir = ROOT / "content" / "awards"
    if awards_dir.exists():
        shutil.rmtree(awards_dir)
    awards_dir.mkdir(parents=True, exist_ok=True)
    for year in bundles:
        (awards_dir / f"{year}.md").write_text(
            f"---\ntitle: {json.dumps(f'{year}–{str(year + 1)[-2:]} Awards')}\nentityId: {json.dumps(str(year))}\n---\n",
            encoding="utf-8",
        )

    sync_static_data()
    print(
        f"Built {len(bundles)} season bundles; current={current_season} "
        f"({len(current_bundle['enriched_players'])} players, {len(current_bundle['enriched_clubs'])} clubs, "
        f"{len(current_bundle['slams'])} slams)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

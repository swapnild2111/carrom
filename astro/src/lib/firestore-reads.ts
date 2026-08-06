// Client-side data helpers — replace scripts/build_derived.py.
//
// The rule: every query filters `active != false` and (where relevant)
// scopes to a season. Aggregations happen in JS after the read.
//
// Design note: we deliberately fetch WHOLE collections here (players, slams)
// because Thane's scale is small (<1000 rows for the foreseeable future).
// If this ever grows, swap to server-side aggregation via Cloud Functions
// that write pre-computed views back to Firestore.

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./firebase";
import type {
  Player,
  Club,
  Slam,
  Season,
  SlamType,
} from "./firestore-schema";

// ── Raw collection reads ──────────────────────────────────────────

export async function listPlayers(): Promise<Player[]> {
  const snap = await getDocs(query(collection(getDb(), "players")));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Player, "id">) }))
    .filter((p) => p.active !== false);
}

export async function listClubs(): Promise<Club[]> {
  const snap = await getDocs(query(collection(getDb(), "clubs")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Club, "id">) }));
}

export async function listSeasons(): Promise<Season[]> {
  const snap = await getDocs(query(collection(getDb(), "seasons"), orderBy("year")));
  return snap.docs.map((d) => d.data() as Season);
}

export async function listActiveSlamsForSeason(seasonYear: number): Promise<Slam[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "slams"),
      where("season", "==", seasonYear),
      where("active", "==", true)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Slam, "id">) }));
}

export async function listAllActiveSlams(): Promise<Slam[]> {
  const snap = await getDocs(
    query(collection(getDb(), "slams"), where("active", "==", true))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Slam, "id">) }));
}

// ── Live subscriptions (for admin drawer + auto-refreshing UI) ────

export function subscribeToActiveSlamsForSeason(
  seasonYear: number,
  onChange: (slams: Slam[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getDb(), "slams"),
      where("season", "==", seasonYear),
      where("active", "==", true)
    ),
    (snap) => {
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Slam, "id">) }))
      );
    }
  );
}

// ── Derived views — mirror scripts/build_derived.py logic ─────────

export interface PlayerStats {
  white: number;
  black: number;
  total: number;
}

export interface LeaderboardRow {
  player: Player;
  clubs: Club[];
  stats: PlayerStats;
  rank: { white: number | null; black: number | null; total: number | null };
}

/**
 * Build a season leaderboard identical to what build_derived.py used to output.
 * O(P + S) where P = players, S = slams — fast enough at any realistic scale.
 */
export function buildSeasonLeaderboard(
  players: Player[],
  clubs: Club[],
  slams: Slam[]
): LeaderboardRow[] {
  const statsByPlayer = new Map<string, PlayerStats>();
  for (const p of players) statsByPlayer.set(p.id, { white: 0, black: 0, total: 0 });
  for (const s of slams) {
    const bucket = statsByPlayer.get(s.playerId);
    if (!bucket) continue;
    if (s.type === "white") bucket.white += 1;
    else if (s.type === "black") bucket.black += 1;
    bucket.total = bucket.white + bucket.black;
  }

  const clubsById = new Map(clubs.map((c) => [c.id, c]));
  const rows: LeaderboardRow[] = players.map((p) => ({
    player: p,
    clubs: (p.clubIds ?? [])
      .map((cid) => clubsById.get(cid))
      .filter((c): c is Club => !!c),
    stats: statsByPlayer.get(p.id) ?? { white: 0, black: 0, total: 0 },
    rank: { white: null, black: null, total: null },
  }));

  // Rank each metric with dense-ish ranking (ties share the higher rank).
  for (const metric of ["white", "black", "total"] as const) {
    const sorted = [...rows].sort((a, b) => b.stats[metric] - a.stats[metric]);
    let currentRank = 0;
    let lastValue = -1;
    sorted.forEach((row, i) => {
      const v = row.stats[metric];
      if (v === 0) return; // rank 0 => no rank
      if (v !== lastValue) {
        currentRank = i + 1;
        lastValue = v;
      }
      row.rank[metric] = currentRank;
    });
  }

  // Default sort: total desc, white desc, name asc.
  rows.sort(
    (a, b) =>
      b.stats.total - a.stats.total ||
      b.stats.white - a.stats.white ||
      a.player.name.localeCompare(b.player.name)
  );

  return rows;
}

// ── Awards + all-time leaders ─────────────────────────────────────

export interface CategoryLeader {
  id: string;
  name: string;
  count: number;
}

export function computeCategoryLeaders(
  rows: LeaderboardRow[],
  metric: "white" | "black" | "total"
): CategoryLeader[] {
  if (!rows.length) return [];
  const best = Math.max(...rows.map((r) => r.stats[metric]));
  if (best === 0) return [];
  return rows
    .filter((r) => r.stats[metric] === best)
    .map((r) => ({ id: r.player.id, name: r.player.name, count: best }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface AllTimeLeaders {
  topTotal: CategoryLeader[];
  topWhite: CategoryLeader[];
  topBlack: CategoryLeader[];
  totalSlams: number;
  playerCount: number;
}

/**
 * All-time leaders across every season combined.
 * Mirrors compute_all_time_leaders() from build_derived.py.
 */
export function computeAllTimeLeaders(
  players: Player[],
  slams: Slam[]
): AllTimeLeaders {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const per = new Map<string, PlayerStats>();

  for (const s of slams) {
    if (s.active === false) continue;
    if (!playersById.has(s.playerId)) continue;
    const bucket = per.get(s.playerId) ?? { white: 0, black: 0, total: 0 };
    if (s.type === "white") bucket.white += 1;
    else if (s.type === "black") bucket.black += 1;
    bucket.total = bucket.white + bucket.black;
    per.set(s.playerId, bucket);
  }

  const topBy = (metric: keyof PlayerStats): CategoryLeader[] => {
    if (!per.size) return [];
    const best = Math.max(...[...per.values()].map((s) => s[metric]));
    if (best === 0) return [];
    return [...per.entries()]
      .filter(([, s]) => s[metric] === best)
      .map(([pid]) => ({
        id: pid,
        name: playersById.get(pid)?.name ?? pid,
        count: best,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  let totalSlams = 0;
  for (const s of per.values()) totalSlams += s.total;

  return {
    topTotal: topBy("total"),
    topWhite: topBy("white"),
    topBlack: topBy("black"),
    totalSlams,
    playerCount: per.size,
  };
}

// ── Season resolution (mirror lib.py::resolve_season) ─────────────

/**
 * The fiscal-year season containing today's date. Falls back to the newest
 * season on file if today doesn't sit inside any configured season.
 */
export function resolveCurrentSeason(seasons: Season[]): number {
  if (!seasons.length) return new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  for (const s of seasons) {
    if (s.start <= today && today <= s.end) return s.year;
  }
  return seasons[seasons.length - 1]!.year;
}

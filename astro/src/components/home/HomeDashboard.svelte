<script lang="ts">
  // Home page. Data comes from a build-time snapshot embedded in the HTML —
  // paints instantly, no client-side Firestore fetch required. Live Firestore
  // listeners can be added on top later; for now the build produces fresh data
  // on every `firebase deploy`.
  import { onMount } from "svelte";
  import {
    buildSeasonLeaderboard,
    computeCategoryLeaders,
    computeAllTimeLeaders,
    resolveCurrentSeason,
    type LeaderboardRow,
    type CategoryLeader,
  } from "@/lib/firestore-reads";
  import type { Player, Club, Season, Slam } from "@/lib/firestore-schema";
  import type { HomeSnapshot } from "@/lib/firestore-server";

  interface Props {
    snapshot: HomeSnapshot;
  }
  let { snapshot }: Props = $props();

  const players: Player[] = snapshot.players;
  const clubs: Club[] = snapshot.clubs;
  const seasons: Season[] = snapshot.seasons;
  const allSlams: Slam[] = snapshot.slams;

  const availableSeasons = seasons.filter((s) => s.available !== false);
  const urlSeason = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
  const initialSeasonYear: number =
    (urlSeason ? parseInt(urlSeason, 10) : NaN) ||
    resolveCurrentSeason(availableSeasons);
  const activeSeasonYear = availableSeasons.some((s) => s.year === initialSeasonYear)
    ? initialSeasonYear
    : resolveCurrentSeason(availableSeasons);
  const activeSeasonLabel: string = availableSeasons.find((s) => s.year === activeSeasonYear)?.label ?? "—";

  const seasonSlams = allSlams.filter((s) => s.season === activeSeasonYear);
  const leaderboard: LeaderboardRow[] = buildSeasonLeaderboard(players, clubs, seasonSlams);
  const allTime = computeAllTimeLeaders(players, allSlams);
  const maxWhite: CategoryLeader[] = computeCategoryLeaders(leaderboard, "white");
  const maxBlack: CategoryLeader[] = computeCategoryLeaders(leaderboard, "black");
  const seasonHasData = leaderboard.some((r) => r.stats.total > 0);

  // ── Chart data (mirrors Hugo layouts/index.html payloads) ───────
  const topPlayers = leaderboard.slice(0, 10).map((row) => ({
    name: row.player.name,
    white: row.stats.white,
    black: row.stats.black,
    total: row.stats.total,
  }));
  const totals = {
    white: leaderboard.reduce((n, r) => n + r.stats.white, 0),
    black: leaderboard.reduce((n, r) => n + r.stats.black, 0),
    all: leaderboard.reduce((n, r) => n + r.stats.total, 0),
  };
  const clubsPayload = clubs.map((c) => {
    const playersInClub = players.filter((p) => (p.clubIds || []).includes(c.id));
    const idSet = new Set(playersInClub.map((p) => p.id));
    const clubSlams = seasonSlams.filter((s) => idSet.has(s.playerId));
    return {
      name: c.name,
      white: clubSlams.filter((s) => s.type === "white").length,
      black: clubSlams.filter((s) => s.type === "black").length,
      total: clubSlams.length,
    };
  });
  const seasonTrend = seasons
    .filter((s) => s.available !== false)
    .sort((a, b) => a.year - b.year)
    .map((s) => {
      const rows = allSlams.filter((sl) => sl.season === s.year);
      return {
        label: s.label,
        white: rows.filter((r) => r.type === "white").length,
        black: rows.filter((r) => r.type === "black").length,
        total: rows.length,
      };
    });

  const chartPayload = { totals, topPlayers, clubs: clubsPayload };
  const trendPayload = { seasons: seasonTrend };

  function playerHref(id: string): string {
    const s = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
    return `/players/${id}/${s ? `?season=${s}` : ""}`;
  }

  // ── Chart.js rendering ──────────────────────────────────────────
  onMount(async () => {
    if (!seasonHasData && !seasonTrend.some((s) => s.total > 0)) return;
    const { default: Chart } = await import("chart.js/auto");
    const muted = "#8b9cb3";
    const border = "#2d3a4f";
    const whiteColor = "#f5f0e6";
    const blackColor = "#c9a227";
    const accent = "#4a9eff";
    Chart.defaults.color = muted;
    Chart.defaults.borderColor = border;
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    const bar = (canvasId: string, labels: string[], whites: number[], blacks: number[]) => {
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) return;
      new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "White slams", data: whites, backgroundColor: whiteColor, borderRadius: 4, stack: "s" },
            { label: "Black slams", data: blacks, backgroundColor: blackColor, borderRadius: 4, stack: "s" },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 16 } },
          },
          scales: {
            x: { stacked: true, grid: { color: "rgba(45, 58, 79, 0.6)" }, ticks: { precision: 0 } },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    };

    if (topPlayers.length && totals.all) {
      bar("chart-top-players", topPlayers.map((p) => p.name), topPlayers.map((p) => p.white), topPlayers.map((p) => p.black));
    }

    const activeClubs = clubsPayload.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    if (activeClubs.length) {
      bar("chart-slams-by-club", activeClubs.map((c) => c.name), activeClubs.map((c) => c.white), activeClubs.map((c) => c.black));
    }

    // Doughnut — white vs black
    const doughCanvas = document.getElementById("chart-white-black") as HTMLCanvasElement | null;
    if (doughCanvas && totals.all) {
      new Chart(doughCanvas, {
        type: "doughnut",
        data: {
          labels: ["White slams", "Black slams"],
          datasets: [
            {
              data: [totals.white, totals.black],
              backgroundColor: [whiteColor, blackColor],
              borderColor: ["#1a2332", "#1a2332"],
              borderWidth: 2,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 12, padding: 16 } },
            tooltip: {
              callbacks: {
                label: (ctx: { label: string; parsed: number }) => {
                  const pct = totals.all ? Math.round((ctx.parsed / totals.all) * 100) : 0;
                  return `${ctx.label}: ${ctx.parsed} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }

    // Radar — top-3 podium
    const radarCanvas = document.getElementById("chart-leaders-pace") as HTMLCanvasElement | null;
    if (radarCanvas && topPlayers.length >= 3) {
      const top3 = topPlayers.slice(0, 3);
      const colors = [accent, "#a78bfa", "#34d399"];
      new Chart(radarCanvas, {
        type: "radar",
        data: {
          labels: ["White", "Black", "Total"],
          datasets: top3.map((p, i) => ({
            label: p.name,
            data: [p.white, p.black, p.total],
            borderColor: colors[i],
            backgroundColor: `${colors[i]}33`,
            borderWidth: 2,
            pointRadius: 3,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12 } } },
          scales: {
            r: {
              angleLines: { color: border },
              grid: { color: "rgba(45, 58, 79, 0.7)" },
              pointLabels: { font: { size: 11 } },
              ticks: { display: false, stepSize: 5 },
            },
          },
        },
      });
    }

    // Line — season trend
    const trendCanvas = document.getElementById("chart-season-trend") as HTMLCanvasElement | null;
    if (trendCanvas && seasonTrend.length) {
      new Chart(trendCanvas, {
        type: "line",
        data: {
          labels: seasonTrend.map((s) => s.label),
          datasets: [
            { label: "White", data: seasonTrend.map((s) => s.white), borderColor: whiteColor, backgroundColor: `${whiteColor}22`, tension: 0.3, pointRadius: 5, borderWidth: 2 },
            { label: "Black", data: seasonTrend.map((s) => s.black), borderColor: blackColor, backgroundColor: `${blackColor}22`, tension: 0.3, pointRadius: 5, borderWidth: 2 },
            { label: "Total", data: seasonTrend.map((s) => s.total), borderColor: accent, backgroundColor: `${accent}22`, tension: 0.3, pointRadius: 5, borderWidth: 2, borderDash: [4, 3] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 16 } } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: "rgba(45, 58, 79, 0.6)" }, ticks: { precision: 0 } },
          },
        },
      });
    }
  });
</script>

{#if allTime.totalSlams > 0}
    <section class="all-time-strip" aria-label="All-time leaders">
      <span class="all-time-strip-label">All-time</span>
      {#if allTime.topTotal[0]}
        <span class="all-time-strip-item">
          <span class="all-time-strip-metric">Most slams</span>
          <a href={playerHref(allTime.topTotal[0].id)}>{allTime.topTotal[0].name}</a>
          <strong>{allTime.topTotal[0].count}</strong>
        </span>
      {/if}
      {#if allTime.topWhite[0]}
        <span class="all-time-strip-item">
          <span class="all-time-strip-metric" aria-hidden="true">○ White</span>
          <a href={playerHref(allTime.topWhite[0].id)}>{allTime.topWhite[0].name}</a>
          <strong>{allTime.topWhite[0].count}</strong>
        </span>
      {/if}
      {#if allTime.topBlack[0]}
        <span class="all-time-strip-item">
          <span class="all-time-strip-metric" aria-hidden="true">● Black</span>
          <a href={playerHref(allTime.topBlack[0].id)}>{allTime.topBlack[0].name}</a>
          <strong>{allTime.topBlack[0].count}</strong>
        </span>
      {/if}
      <span class="all-time-strip-item all-time-strip-item-meta">
        {allTime.totalSlams} slams across {seasons.length} seasons
      </span>
    </section>
  {/if}

  <section class="hero hero-compact">
    <div class="hero-inner">
      <p class="hero-eyebrow">{activeSeasonLabel} season · Thane District</p>
      <h2 class="hero-title">Thane Slam Tracker</h2>
      <p class="hero-lead">
        Every white and black slam for Thane players — live from Firestore.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href={`/awards/?season=${activeSeasonYear}`}>View {activeSeasonLabel} awards</a>
      </div>
    </div>
  </section>

  <section class="awards-race page-section">
    <div class="section-heading">
      <h3>{activeSeasonLabel} trophy race</h3>
      <p class="section-desc">Category leaders on track for the season-end awards.</p>
    </div>
    <div class="awards-race-grid">
      <article class="awards-race-card awards-race-white">
        <header class="awards-race-head">
          <span class="awards-race-dot" aria-hidden="true">○</span>
          <span class="awards-race-cat">Max white slams</span>
        </header>
        {#if maxWhite.length}
          {#each maxWhite as w}
            <p class="awards-race-winner">
              <a href={playerHref(w.id)}>{w.name}</a>
              <span class="awards-race-count">{w.count}</span>
            </p>
          {/each}
        {:else}
          <p class="awards-race-empty text-muted">No white slams recorded yet this season.</p>
        {/if}
      </article>
      <article class="awards-race-card awards-race-black">
        <header class="awards-race-head">
          <span class="awards-race-dot" aria-hidden="true">●</span>
          <span class="awards-race-cat">Max black slams</span>
        </header>
        {#if maxBlack.length}
          {#each maxBlack as w}
            <p class="awards-race-winner">
              <a href={playerHref(w.id)}>{w.name}</a>
              <span class="awards-race-count">{w.count}</span>
            </p>
          {/each}
        {:else}
          <p class="awards-race-empty text-muted">No black slams recorded yet this season.</p>
        {/if}
      </article>
    </div>
  </section>

  {#if seasonHasData}
    <section class="stat-cards" aria-label="Season summary">
      <div class="stat-card stat-white">
        <span class="stat-icon" aria-hidden="true">○</span>
        <span class="stat-value">{leaderboard.reduce((n, r) => n + r.stats.white, 0)}</span>
        <span class="stat-label">White slams</span>
      </div>
      <div class="stat-card stat-black">
        <span class="stat-icon" aria-hidden="true">●</span>
        <span class="stat-value">{leaderboard.reduce((n, r) => n + r.stats.black, 0)}</span>
        <span class="stat-label">Black slams</span>
      </div>
      <div class="stat-card stat-total">
        <span class="stat-icon" aria-hidden="true">∑</span>
        <span class="stat-value">{leaderboard.reduce((n, r) => n + r.stats.total, 0)}</span>
        <span class="stat-label">Total slams</span>
      </div>
      <div class="stat-card stat-players">
        <span class="stat-icon" aria-hidden="true">#</span>
        <span class="stat-value">{players.length}</span>
        <span class="stat-label">Players</span>
      </div>
    </section>
  {:else}
    <section class="season-empty" aria-label="Season summary">
      <div class="season-empty-inner">
        <span class="season-empty-icon" aria-hidden="true">✧</span>
        <div>
          <h4>No slams recorded for {activeSeasonLabel} yet.</h4>
          <p>Season runs {seasons.find((s) => s.year === activeSeasonYear)?.start} → {seasons.find((s) => s.year === activeSeasonYear)?.end}. New slams appear here as they land.</p>
        </div>
      </div>
    </section>
  {/if}

  <section class="dashboard-grid page-section" aria-label="Season dashboard">
    <div class="dashboard-leaderboard" id="leaderboard">
      <div class="section-header">
        <div class="section-heading section-heading-inline">
          <h3>{activeSeasonLabel} leaderboard</h3>
          <p class="section-desc">{players.length} players ranked by total slams.</p>
        </div>
      </div>
      <div class="table-wrap table-wrap-elevated">
        <table class="leaderboard-table" id="leaderboard-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col" class="num col-white">W</th>
              <th scope="col" class="num col-black">B</th>
              <th scope="col" class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {#if !seasonHasData}
              <tr class="leaderboard-empty-row">
                <td colspan="5" class="leaderboard-empty">No slams recorded for {activeSeasonLabel} yet.</td>
              </tr>
            {:else}
              {#each leaderboard as row (row.player.id)}
                <tr>
                  <td class="col-rank">
                    {#if row.rank.total}
                      {#if row.rank.total <= 3}
                        <span class="rank-badge rank-{row.rank.total}" title="Rank {row.rank.total}">{row.rank.total}</span>
                      {:else}
                        <span class="rank-num">{row.rank.total}</span>
                      {/if}
                    {:else}—{/if}
                  </td>
                  <td class="col-player"><a href={playerHref(row.player.id)}>{row.player.name}</a></td>
                  <td class="num col-white">{row.stats.white}</td>
                  <td class="num col-black">{row.stats.black}</td>
                  <td class="num col-total"><strong>{row.stats.total}</strong></td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    <aside class="dashboard-chart-primary">
      <article class="chart-card chart-card-full">
        <h4>Top 10 players</h4>
        <p class="chart-caption">Stacked white and black slams — longest bar leads the district.</p>
        <div class="chart-canvas-wrap chart-canvas-tall">
          {#if topPlayers.length && totals.all}
            <canvas id="chart-top-players" role="img" aria-label="Horizontal bar chart of top 10 players"></canvas>
          {:else}
            <p class="chart-empty-msg">No data available for this season yet.</p>
          {/if}
        </div>
      </article>
    </aside>
  </section>

  <section class="charts-section page-section" aria-label="Club standings">
    <div class="section-heading">
      <h3>Slams by club</h3>
      <p class="section-desc">Where the season's slams are being logged.</p>
    </div>
    <article class="chart-card chart-card-wide">
      <div class="chart-canvas-wrap chart-canvas-tall">
        {#if clubsPayload.some((c) => c.total > 0)}
          <canvas id="chart-slams-by-club" role="img" aria-label="Horizontal bar chart of slams grouped by club"></canvas>
        {:else}
          <p class="chart-empty-msg">No club data yet this season.</p>
        {/if}
      </div>
    </article>
  </section>

  <section class="season-trend page-section" aria-labelledby="trend-heading">
    <div class="section-heading">
      <h3 id="trend-heading">Season-over-season</h3>
      <p class="section-desc">Total white and black slams per season — Thane's growth over time.</p>
    </div>
    <div class="chart-card chart-card-wide">
      <div class="chart-canvas-wrap chart-canvas-tall">
        {#if seasonTrend.some((s) => s.total > 0)}
          <canvas id="chart-season-trend" role="img" aria-label="Line chart of slams across seasons"></canvas>
        {:else}
          <p class="chart-empty-msg">No slams recorded across seasons yet.</p>
        {/if}
      </div>
    </div>
  </section>

  <section class="charts-section page-section" aria-label="Deeper analytics">
    <div class="section-heading">
      <h3>Deeper analytics</h3>
      <p class="section-desc">White/black split and podium comparison for anyone who wants a closer look.</p>
    </div>
    <div class="charts-grid charts-grid-2">
      <article class="chart-card">
        <h4>White vs black split</h4>
        <p class="chart-caption">Share of all recorded slams this season.</p>
        <div class="chart-canvas-wrap">
          {#if totals.all}
            <canvas id="chart-white-black" role="img" aria-label="Doughnut chart of white versus black slams"></canvas>
          {:else}
            <p class="chart-empty-msg">No slams this season.</p>
          {/if}
        </div>
      </article>
      <article class="chart-card">
        <h4>Top-3 podium</h4>
        <p class="chart-caption">How the top three compare across white, black, and total.</p>
        <div class="chart-canvas-wrap">
          {#if topPlayers.length >= 3 && totals.all}
            <canvas id="chart-leaders-pace" role="img" aria-label="Radar chart comparing top three players"></canvas>
          {:else}
            <p class="chart-empty-msg">Need at least 3 players with slams to render.</p>
          {/if}
        </div>
      </article>
    </div>
  </section>

<style>
  /* home dashboard styles inherit from global.css */
</style>

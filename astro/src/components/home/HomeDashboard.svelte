<script lang="ts">
  // Home page data-driven regions — Hall of Fame band, trophy race, leaderboard,
  // stat cards, all sourced from Firestore. Ports the interesting portions of
  // Hugo's layouts/index.html.
  //
  // Design: one component owns all the data. Loads once on mount, re-renders
  // when the selected season changes. The parent Astro page renders a static
  // skeleton (charts, headings) so first paint is fast; this component fills
  // in the numbers.
  import { onMount } from "svelte";
  import {
    listPlayers,
    listClubs,
    listSeasons,
    listActiveSlamsForSeason,
    listAllActiveSlams,
    buildSeasonLeaderboard,
    computeCategoryLeaders,
    computeAllTimeLeaders,
    resolveCurrentSeason,
    type LeaderboardRow,
    type CategoryLeader,
    type AllTimeLeaders,
  } from "@/lib/firestore-reads";
  import type { Player, Club, Season } from "@/lib/firestore-schema";

  let players: Player[] = $state([]);
  let clubs: Club[] = $state([]);
  let seasons: Season[] = $state([]);
  let activeSeasonYear: number | null = $state(null);
  let activeSeasonLabel = $state("—");
  let leaderboard: LeaderboardRow[] = $state([]);
  let allTime: AllTimeLeaders = $state({
    topTotal: [],
    topWhite: [],
    topBlack: [],
    totalSlams: 0,
    playerCount: 0,
  });
  let maxWhite: CategoryLeader[] = $state([]);
  let maxBlack: CategoryLeader[] = $state([]);
  let seasonHasData = $state(false);
  let loading = $state(true);

  onMount(async () => {
    const urlSeason = new URLSearchParams(location.search).get("season");
    [players, clubs, seasons] = await Promise.all([listPlayers(), listClubs(), listSeasons()]);
    const availableSeasons = seasons.filter((s) => s.available !== false);
    activeSeasonYear = urlSeason ? parseInt(urlSeason, 10) : resolveCurrentSeason(availableSeasons);
    if (!availableSeasons.some((s) => s.year === activeSeasonYear)) {
      activeSeasonYear = resolveCurrentSeason(availableSeasons);
    }
    activeSeasonLabel = availableSeasons.find((s) => s.year === activeSeasonYear)?.label ?? "—";

    const [seasonSlams, allSlams] = await Promise.all([
      listActiveSlamsForSeason(activeSeasonYear!),
      listAllActiveSlams(),
    ]);

    leaderboard = buildSeasonLeaderboard(players, clubs, seasonSlams);
    allTime = computeAllTimeLeaders(players, allSlams);
    maxWhite = computeCategoryLeaders(leaderboard, "white");
    maxBlack = computeCategoryLeaders(leaderboard, "black");
    seasonHasData = leaderboard.some((r) => r.stats.total > 0);
    loading = false;
  });

  function playerHref(id: string): string {
    const s = new URLSearchParams(location.search).get("season");
    return `/players/${id}/${s ? `?season=${s}` : ""}`;
  }
</script>

{#if loading}
  <p class="loading">Loading live data…</p>
{:else}
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
  </section>
{/if}

<style>
  .loading {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 1rem;
  }
</style>

<script lang="ts">
  // Player detail — ported from layouts/players/single.html + player-charts.js.
  // Reads from the build-time snapshot (no client Firestore fetch).
  import { onMount } from "svelte";
  import {
    buildSeasonLeaderboard,
    enrichPlayer,
    resolveCurrentSeason,
  } from "@/lib/firestore-reads";
  import type { HomeSnapshot } from "@/lib/firestore-server";
  import type { Club } from "@/lib/firestore-schema";

  interface Props {
    snapshot: HomeSnapshot;
    playerId: string;
  }
  let { snapshot, playerId }: Props = $props();

  const players = snapshot.players;
  const clubs = snapshot.clubs;
  const seasons = snapshot.seasons;
  const allSlams = snapshot.slams;

  const availableSeasons = seasons.filter((s) => s.available !== false);
  const urlSeason = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
  const parsedSeason = urlSeason ? parseInt(urlSeason, 10) : NaN;
  const seasonYear = availableSeasons.some((s) => s.year === parsedSeason)
    ? parsedSeason
    : resolveCurrentSeason(availableSeasons);
  const seasonLabel = availableSeasons.find((s) => s.year === seasonYear)?.label ?? String(seasonYear);
  const seasonSlams = allSlams.filter((s) => s.season === seasonYear);

  const leaderboard = buildSeasonLeaderboard(players, clubs, seasonSlams);
  const player = players.find((p) => p.id === playerId);
  const enriched = player ? enrichPlayer(player, leaderboard, clubs, seasonSlams) : null;
  const leader = leaderboard[0] ?? null;

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }

  function clubHref(id: string): string {
    const s = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
    return `/clubs/${id}/${s ? `?season=${s}` : ""}`;
  }

  function homeHref(): string {
    const s = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
    return `/${s ? `?season=${s}` : ""}`;
  }

  const clubsById = new Map<string, Club>(clubs.map((c) => [c.id, c]));

  function displaySource(g: { source: string; clubId: string | null; tournament: string | null; videoUrl: string | null }): { text: string; href?: string } {
    if (g.source === "club" && g.clubId) {
      return { text: clubsById.get(g.clubId)?.name ?? g.clubId };
    }
    if (g.source === "tournament") {
      return { text: g.tournament ?? "Tournament" };
    }
    if (g.source === "youtube") {
      return g.videoUrl ? { text: "YouTube", href: g.videoUrl } : { text: "YouTube" };
    }
    return { text: g.source.charAt(0).toUpperCase() + g.source.slice(1) };
  }

  // ── Doughnut chart (white vs black mix) ─────────────────────────
  onMount(async () => {
    if (!enriched || enriched.stats.total === 0) return;
    const { default: Chart } = await import("chart.js/auto");
    const canvas = document.getElementById("player-chart-mix") as HTMLCanvasElement | null;
    if (!canvas) return;
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["White slams", "Black slams"],
        datasets: [{
          data: [enriched.stats.white, enriched.stats.black],
          backgroundColor: ["#f5f0e6", "#c9a227"],
          borderColor: ["#1a2332", "#1a2332"],
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12, padding: 16 } },
        },
      },
    });
  });

  const whitePct = enriched && enriched.stats.total > 0
    ? Math.round((enriched.stats.white / enriched.stats.total) * 100)
    : 0;
  const blackPct = enriched && enriched.stats.total > 0 ? 100 - whitePct : 0;
</script>

{#if !enriched}
  <p class="empty-state">Player not found.</p>
{:else}
  <div class="player-page">
    <header class="player-hero">
      <div class="player-hero-main">
        <div class="player-avatar-lg" aria-hidden="true">{initials(enriched.player.name)}</div>
        <div class="player-identity">
          <p class="breadcrumb"><a href={homeHref()}>Leaderboard</a> / Player</p>
          <h1 class="player-name">{enriched.player.name}</h1>
          {#if enriched.player.aliases && enriched.player.aliases.length}
            <p class="player-aliases">Also known as {enriched.player.aliases.join(", ")}</p>
          {/if}
          <div class="player-tags">
            <span class="player-tag">{enriched.player.district ?? "Thane"} District</span>
            <span class="player-tag">{enriched.player.gender === "male" ? "Male" : "Female"}</span>
            {#each enriched.clubs as c (c.id)}
              <a class="player-tag player-tag-club" href={clubHref(c.id)}>{c.name}</a>
            {/each}
          </div>
        </div>
      </div>
      {#if enriched.rank.total}
        <div class="player-rank-spotlight" class:player-rank-spotlight-top1={enriched.rank.total === 1} class:player-rank-spotlight-top2={enriched.rank.total === 2} class:player-rank-spotlight-top3={enriched.rank.total === 3}>
          <span class="player-rank-value">#{enriched.rank.total}</span>
          <span class="player-rank-label">overall rank</span>
          <span class="player-rank-sub">of {players.length} in Thane</span>
        </div>
      {/if}
    </header>

    <section class="player-metrics" aria-label="Season statistics">
      <article class="player-metric player-metric-white">
        <span class="player-metric-icon" aria-hidden="true">○</span>
        <span class="player-metric-value">{enriched.stats.white}</span>
        <span class="player-metric-label">White slams</span>
        {#if enriched.rank.white}<span class="player-metric-rank">#{enriched.rank.white} in district</span>{/if}
      </article>
      <article class="player-metric player-metric-black">
        <span class="player-metric-icon" aria-hidden="true">●</span>
        <span class="player-metric-value">{enriched.stats.black}</span>
        <span class="player-metric-label">Black slams</span>
        {#if enriched.rank.black}<span class="player-metric-rank">#{enriched.rank.black} in district</span>{/if}
      </article>
      <article class="player-metric player-metric-total">
        <span class="player-metric-icon" aria-hidden="true">∑</span>
        <span class="player-metric-value">{enriched.stats.total}</span>
        <span class="player-metric-label">Total slams</span>
        {#if enriched.rank.total}<span class="player-metric-rank">#{enriched.rank.total} in district</span>{/if}
      </article>
    </section>

    {#if enriched.stats.total > 0}
      <div class="player-dashboard">
        <section class="player-panel player-panel-mix" aria-labelledby="mix-heading">
          <h3 id="mix-heading">Slam mix</h3>
          <p class="player-panel-desc">White vs black breakdown for the {seasonLabel} season.</p>
          <div class="player-mix-layout">
            <div class="player-chart-wrap">
              <canvas id="player-chart-mix" role="img" aria-label="Doughnut chart of white versus black slams"></canvas>
            </div>
            <div class="player-mix-stats">
              <div class="player-ratio-bar" role="presentation">
                <span class="player-ratio-white" style="width: {whitePct}%"></span>
                <span class="player-ratio-black" style="width: {blackPct}%"></span>
              </div>
              <dl class="player-mix-legend">
                <div class="player-mix-row">
                  <dt><span class="mix-dot mix-dot-white"></span> White</dt>
                  <dd>{enriched.stats.white} <span class="mix-pct">({whitePct}%)</span></dd>
                </div>
                <div class="player-mix-row">
                  <dt><span class="mix-dot mix-dot-black"></span> Black</dt>
                  <dd>{enriched.stats.black} <span class="mix-pct">({blackPct}%)</span></dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section class="player-panel player-panel-standings" aria-labelledby="standings-heading">
          <h3 id="standings-heading">District standing</h3>
          <p class="player-panel-desc">How this player compares to the season leader.</p>
          <ul class="player-standing-list">
            {#each [{ key: "white", label: "White slams", cls: "white" }, { key: "black", label: "Black slams", cls: "black" }, { key: "total", label: "Total slams", cls: "total" }] as m (m.key)}
              {@const val = enriched.stats[m.key as "white" | "black" | "total"]}
              {@const rank = enriched.rank[m.key as "white" | "black" | "total"]}
              {@const lead = leader?.stats?.[m.key as "white" | "black" | "total"] ?? 0}
              {@const pct = lead > 0 ? Math.round((val / lead) * 100) : 0}
              <li class="player-standing-row">
                <div class="player-standing-top">
                  <span class="player-standing-label">{m.label}</span>
                  {#if rank}<span class="player-standing-rank">#{rank}</span>{/if}
                </div>
                <div class="player-standing-bar" role="presentation">
                  <span class="player-standing-fill player-standing-fill-{m.cls}" style="width: {pct}%"></span>
                </div>
                <p class="player-standing-meta"><strong>{val}</strong>{#if lead} of {lead} leader{/if}</p>
              </li>
            {/each}
          </ul>
        </section>

        {#if Object.keys(enriched.stats.bySource).length}
          <section class="player-panel player-panel-sources" aria-labelledby="sources-heading">
            <h3 id="sources-heading">Slam sources</h3>
            <p class="player-panel-desc">Where this player's slams were recorded.</p>
            <ul class="player-source-list">
              {#each Object.entries(enriched.stats.bySource) as [source, count] (source)}
                {@const pct = enriched.stats.total > 0 ? Math.round((count / enriched.stats.total) * 100) : 0}
                <li class="player-source-item">
                  <span class="player-source-name">{source.charAt(0).toUpperCase() + source.slice(1)}</span>
                  <span class="player-source-count">{count}</span>
                  <span class="player-source-bar" role="presentation">
                    <span class="player-source-fill" style="width: {pct}%"></span>
                  </span>
                </li>
              {/each}
            </ul>
            {#if Object.keys(enriched.stats.byClub).length}
              <h4 class="player-subheading">By club</h4>
              <ul class="player-club-chips">
                {#each Object.entries(enriched.stats.byClub) as [clubId, count] (clubId)}
                  {@const club = clubsById.get(clubId)}
                  <li>
                    {#if club}
                      <a href={clubHref(club.id)}>{club.name}</a>
                    {:else}
                      {clubId}
                    {/if}
                    <span class="player-club-count">{count}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </div>

      <section class="player-activity" aria-labelledby="activity-heading">
        <div class="player-activity-header">
          <div>
            <h3 id="activity-heading">Slam log</h3>
            <p class="player-panel-desc">
              {enriched.stats.total} slam{enriched.stats.total === 1 ? "" : "s"} in {seasonLabel}
            </p>
          </div>
        </div>
        {#if enriched.timelineGroups.length}
          <div class="player-log">
            {#each enriched.timelineGroups as g (g.id)}
              {@const src = displaySource(g)}
              <article class="player-log-entry player-log-{g.type}">
                <div class="player-log-badge">
                  <span class="badge badge-{g.type}">{g.type}</span>
                  {#if g.count > 1}<span class="player-log-count">×{g.count}</span>{/if}
                </div>
                <div class="player-log-body">
                  <p class="player-log-title">
                    {#if src.href}
                      <a href={src.href} target="_blank" rel="noopener">{src.text}</a>
                    {:else}
                      {src.text}
                    {/if}
                  </p>
                  <p class="player-log-meta">
                    <span class="player-log-source">{g.source.charAt(0).toUpperCase() + g.source.slice(1)}</span>
                    {#if g.date}<span>{g.date}</span>{/if}
                    {#if g.location}<span>{g.location}</span>{/if}
                    {#if g.matchRef}<span>{g.matchRef}</span>{/if}
                  </p>
                  {#if g.notes && g.notes !== "Imported from Total slam Excel sheet (2025 aggregate)"}
                    <p class="player-log-notes">{g.notes}</p>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty-state">No slams recorded for this player in the {seasonLabel} season yet.</p>
        {/if}
      </section>
    {:else}
      <section class="player-empty">
        <p class="empty-state">No slams recorded for this player in the {seasonLabel} season yet.</p>
        <p><a class="btn btn-primary" href={homeHref()}>Back to leaderboard</a></p>
      </section>
    {/if}
  </div>
{/if}

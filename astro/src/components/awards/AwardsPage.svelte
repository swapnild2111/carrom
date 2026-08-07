<script lang="ts">
  // Awards page — ports layouts/awards/single.html.
  // Shows current leaders (max white / max black) and a top-5 race per category.
  //
  // Season lives in the URL PATH (/awards/{year}/), not the query. When the
  // site-wide picker sets a new `?season=YYYY` query, we soft-redirect to
  // `/awards/YYYY/` so the awards page re-renders with that year's data.
  import { onMount } from "svelte";
  import { buildSeasonLeaderboard } from "@/lib/firestore-reads";
  import type { HomeSnapshot } from "@/lib/firestore-server";

  interface Props {
    snapshot: HomeSnapshot;
    year: number;
  }
  let { snapshot, year }: Props = $props();

  onMount(() => {
    const sync = async () => {
      const q = new URLSearchParams(location.search).get("season");
      const target = q ? parseInt(q, 10) : NaN;
      if (
        target &&
        target !== year &&
        snapshot.seasons.some((s) => s.year === target && s.available !== false)
      ) {
        const { navigate } = await import("astro:transitions/client");
        navigate(`/awards/${target}/?season=${target}`);
      }
    };
    sync();
    document.addEventListener("astro:page-load", sync);
    return () => document.removeEventListener("astro:page-load", sync);
  });

  const seasonDoc = snapshot.seasons.find((s) => s.year === year);
  const seasonLabel = seasonDoc?.label ?? String(year);
  const seasonSlams = snapshot.slams.filter((s) => s.season === year);
  const leaderboard = buildSeasonLeaderboard(snapshot.players, snapshot.clubs, seasonSlams);

  const raceWhite = [...leaderboard]
    .sort((a, b) => b.stats.white - a.stats.white || a.player.name.localeCompare(b.player.name))
    .slice(0, 5);
  const raceBlack = [...leaderboard]
    .sort((a, b) => b.stats.black - a.stats.black || a.player.name.localeCompare(b.player.name))
    .slice(0, 5);

  const leaderWhite = raceWhite[0];
  const leaderBlack = raceBlack[0];

  // Winners = every player tied for the top count (Hugo returns [] on zero).
  const maxWhiteSlams = (leaderWhite?.stats.white ?? 0) > 0
    ? leaderboard.filter((r) => r.stats.white === leaderWhite!.stats.white)
    : [];
  const maxBlackSlams = (leaderBlack?.stats.black ?? 0) > 0
    ? leaderboard.filter((r) => r.stats.black === leaderBlack!.stats.black)
    : [];

  const ceremonyUrl = seasonDoc?.ceremonyVideoUrl ?? null;
  const videoID = ((): string => {
    if (!ceremonyUrl) return "";
    try {
      const url = new URL(ceremonyUrl);
      if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "");
      return url.searchParams.get("v") ?? "";
    } catch {
      return "";
    }
  })();

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  function playerHref(id: string): string {
    return `/players/${id}/?season=${year}`;
  }
  function homeHref(): string {
    return `/?season=${year}`;
  }
</script>

<div class="awards-page">
  <header class="awards-page-header">
    <p class="breadcrumb"><a href={homeHref()}>Leaderboard</a> / Awards</p>
    <h2 class="awards-page-title">{seasonLabel} season awards</h2>
    <p class="awards-page-sub">Team Carrom and Flute celebrate Thane's top slam performers</p>
  </header>

  <section class="champions-spotlight" aria-labelledby="champions-heading">
    <h3 id="champions-heading" class="awards-section-label">Current leaders</h3>
    <div class="champions-grid">
      {#if maxWhiteSlams.length}
        {#each maxWhiteSlams as w (w.player.id)}
          <article class="champion-card champion-card-white">
            <div class="champion-avatar" aria-hidden="true">{initials(w.player.name)}</div>
            <p class="champion-badge"><span class="champion-medal" aria-hidden="true">1</span> White slams</p>
            <h4 class="champion-name"><a href={playerHref(w.player.id)}>{w.player.name}</a></h4>
            <p class="champion-stat"><span class="champion-count">{w.stats.white}</span> white slam{w.stats.white === 1 ? "" : "s"}</p>
            <a class="champion-link" href={playerHref(w.player.id)}>View profile</a>
          </article>
        {/each}
      {:else}
        <article class="champion-card champion-card-white champion-card-empty">
          <p class="champion-empty">No white slam leader yet this season.</p>
        </article>
      {/if}

      {#if maxBlackSlams.length}
        {#each maxBlackSlams as w (w.player.id)}
          <article class="champion-card champion-card-black">
            <div class="champion-avatar" aria-hidden="true">{initials(w.player.name)}</div>
            <p class="champion-badge"><span class="champion-medal" aria-hidden="true">1</span> Black slams</p>
            <h4 class="champion-name"><a href={playerHref(w.player.id)}>{w.player.name}</a></h4>
            <p class="champion-stat"><span class="champion-count">{w.stats.black}</span> black slam{w.stats.black === 1 ? "" : "s"}</p>
            <a class="champion-link" href={playerHref(w.player.id)}>View profile</a>
          </article>
        {/each}
      {:else}
        <article class="champion-card champion-card-black champion-card-empty">
          <p class="champion-empty">No black slam leader yet this season.</p>
        </article>
      {/if}
    </div>
  </section>

  {#if videoID}
    <section class="ceremony-section" aria-labelledby="ceremony-heading">
      <div class="ceremony-copy">
        <h3 id="ceremony-heading">Award ceremony</h3>
        <p class="ceremony-desc">Watch Team Carrom and Flute felicitate the season's best on YouTube.</p>
      </div>
      <div class="video-embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoID}`}
          title={`${seasonLabel} Thane District Carrom award ceremony`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
      <p class="ceremony-fallback">
        <a href={ceremonyUrl!} target="_blank" rel="noopener noreferrer">Open on YouTube</a>
      </p>
    </section>
  {/if}

  <section class="race-section" aria-labelledby="race-heading">
    <h3 id="race-heading" class="awards-section-label">The race</h3>
    <p class="race-intro">Top five in each category — bars show distance from the leader.</p>
    <div class="race-grid">
      <div class="race-panel race-panel-white">
        <h4 class="race-panel-title"><span class="race-dot race-dot-white" aria-hidden="true"></span> White slams</h4>
        <ol class="race-list">
          {#each raceWhite as p, i (p.player.id)}
            {@const count = p.stats.white}
            {@const pct = leaderWhite && leaderWhite.stats.white > 0 ? Math.round((count / leaderWhite.stats.white) * 100) : 0}
            <li class="race-row race-row-top-{i + 1}">
              <div class="race-row-top">
                <span class="race-rank">{i + 1}</span>
                <a class="race-player" href={playerHref(p.player.id)}>{p.player.name}</a>
                <span class="race-score">{count}</span>
              </div>
              <div class="race-bar" role="presentation">
                <span class="race-bar-fill race-bar-fill-white" style="width: {pct}%"></span>
              </div>
            </li>
          {/each}
        </ol>
      </div>

      <div class="race-panel race-panel-black">
        <h4 class="race-panel-title"><span class="race-dot race-dot-black" aria-hidden="true"></span> Black slams</h4>
        <ol class="race-list">
          {#each raceBlack as p, i (p.player.id)}
            {@const count = p.stats.black}
            {@const pct = leaderBlack && leaderBlack.stats.black > 0 ? Math.round((count / leaderBlack.stats.black) * 100) : 0}
            <li class="race-row race-row-top-{i + 1}">
              <div class="race-row-top">
                <span class="race-rank">{i + 1}</span>
                <a class="race-player" href={playerHref(p.player.id)}>{p.player.name}</a>
                <span class="race-score">{count}</span>
              </div>
              <div class="race-bar" role="presentation">
                <span class="race-bar-fill race-bar-fill-black" style="width: {pct}%"></span>
              </div>
            </li>
          {/each}
        </ol>
      </div>
    </div>
  </section>
</div>

<script lang="ts">
  // Club index page — grid of all clubs with roster/slam counts.
  // Ports layouts/clubs/list.html; roster counts computed from the active season.
  import { enrichClub, resolveCurrentSeason } from "@/lib/firestore-reads";
  import type { HomeSnapshot } from "@/lib/firestore-server";

  interface Props { snapshot: HomeSnapshot }
  let { snapshot }: Props = $props();

  const seasons = snapshot.seasons.filter((s) => s.available !== false);
  const urlSeason = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
  const parsed = urlSeason ? parseInt(urlSeason, 10) : NaN;
  const seasonYear = seasons.some((s) => s.year === parsed) ? parsed : resolveCurrentSeason(seasons);
  const seasonSlams = snapshot.slams.filter((s) => s.season === seasonYear);

  const enrichedClubs = snapshot.clubs.map((c) => enrichClub(c, snapshot.players, seasonSlams));

  function clubHref(id: string): string {
    return `/clubs/${id}/${urlSeason ? `?season=${urlSeason}` : ""}`;
  }
  function homeHref(): string {
    return `/${urlSeason ? `?season=${urlSeason}` : ""}`;
  }
</script>

<section class="entity-header">
  <p class="breadcrumb"><a href={homeHref()}>Leaderboard</a> / Clubs</p>
  <h2>Thane clubs</h2>
  <p class="entity-aliases">Every club that logs player slams across Thane.</p>
</section>

<div class="club-grid">
  {#each enrichedClubs as ec (ec.club.id)}
    <a class="club-card" href={clubHref(ec.club.id)}>
      <span class="club-card-icon" aria-hidden="true">◆</span>
      <h4>{ec.club.name}</h4>
      <p>{ec.roster.length} players · {ec.stats.total} slams logged</p>
    </a>
  {/each}
</div>

<script lang="ts">
  // Club detail — ports layouts/clubs/single.html.
  import { enrichClub, resolveCurrentSeason } from "@/lib/firestore-reads";
  import type { HomeSnapshot } from "@/lib/firestore-server";

  interface Props {
    snapshot: HomeSnapshot;
    clubId: string;
  }
  let { snapshot, clubId }: Props = $props();

  const seasons = snapshot.seasons.filter((s) => s.available !== false);
  const urlSeason = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
  const parsed = urlSeason ? parseInt(urlSeason, 10) : NaN;
  const seasonYear = seasons.some((s) => s.year === parsed) ? parsed : resolveCurrentSeason(seasons);
  const seasonSlams = snapshot.slams.filter((s) => s.season === seasonYear);

  const club = snapshot.clubs.find((c) => c.id === clubId);
  const enriched = club ? enrichClub(club, snapshot.players, seasonSlams) : null;

  function playerHref(id: string): string {
    return `/players/${id}/${urlSeason ? `?season=${urlSeason}` : ""}`;
  }
  function homeHref(): string {
    return `/${urlSeason ? `?season=${urlSeason}` : ""}`;
  }
</script>

{#if !enriched}
  <p class="empty-state">Club not found.</p>
{:else}
  <section class="entity-header">
    <p class="breadcrumb"><a href={homeHref()}>Leaderboard</a> / Club</p>
    <h2>{enriched.club.name}</h2>
    <div class="entity-meta">
      <span class="badge badge-district">{enriched.club.district ?? "Thane"} District</span>
      {#if enriched.club.contact}<span class="badge">Contact: {enriched.club.contact}</span>{/if}
    </div>
    {#if enriched.club.notes && enriched.club.notes !== "Default club for Total slam sheet import."}
      <p class="entity-notes">{enriched.club.notes}</p>
    {/if}
  </section>

  <section class="stat-cards" aria-label="Club slam stats">
    <div class="stat-card stat-white">
      <span class="stat-value">{enriched.stats.white}</span>
      <span class="stat-label">White slams logged</span>
    </div>
    <div class="stat-card stat-black">
      <span class="stat-value">{enriched.stats.black}</span>
      <span class="stat-label">Black slams logged</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{enriched.roster.length}</span>
      <span class="stat-label">Players</span>
    </div>
  </section>

  <section class="roster-section">
    <h3>Roster</h3>
    <p class="section-desc">Players linked to this club. Slam counts are for slams <strong>logged via this club</strong> only — blank if none recorded.</p>
    {#if enriched.roster.length}
      <div class="table-wrap">
        <table class="timeline-table roster-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col" class="num">White</th>
              <th scope="col" class="num">Black</th>
              <th scope="col" class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {#each enriched.roster as r (r.id)}
              <tr>
                <td><a href={playerHref(r.id)}>{r.name}</a></td>
                <td class="num">{#if r.white > 0}{r.white}{:else}<span class="text-muted">—</span>{/if}</td>
                <td class="num">{#if r.black > 0}{r.black}{:else}<span class="text-muted">—</span>{/if}</td>
                <td class="num">{#if r.total > 0}<strong>{r.total}</strong>{:else}<span class="text-muted">—</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty-state">No players linked to this club yet.</p>
    {/if}
  </section>
{/if}

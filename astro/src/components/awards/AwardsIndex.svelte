<script lang="ts">
  // /awards/ landing — resolves the selected season from ?season= (or current)
  // and forwards to /awards/{year}/. Also shows a list of every past season
  // so visitors can jump between years.
  //
  // Uses Astro's soft navigate() so the ?season= query is preserved and the
  // ClientRouter transitions apply instead of a full reload.
  import { onMount } from "svelte";
  import { resolveCurrentSeason } from "@/lib/firestore-reads";
  import type { HomeSnapshot } from "@/lib/firestore-server";

  interface Props { snapshot: HomeSnapshot }
  let { snapshot }: Props = $props();

  const seasons = snapshot.seasons.filter((s) => s.available !== false).sort((a, b) => b.year - a.year);

  function pickTarget(): number {
    const urlSeason = new URLSearchParams(location.search).get("season");
    const parsed = urlSeason ? parseInt(urlSeason, 10) : NaN;
    return seasons.some((s) => s.year === parsed) ? parsed : resolveCurrentSeason(seasons);
  }

  onMount(async () => {
    const targetYear = pickTarget();
    const target = `/awards/${targetYear}/?season=${targetYear}`;
    if (location.pathname !== `/awards/${targetYear}/`) {
      try {
        const { navigate } = await import("astro:transitions/client");
        await navigate(target);
      } catch {
        location.replace(target);
      }
    }
  });

  const seasonQS = (year: number) => `?season=${year}`;
</script>

<section class="entity-header">
  <p class="breadcrumb"><a href="/">Leaderboard</a> / Awards</p>
  <h2>Awards</h2>
  <p class="entity-aliases">Loading current season awards…</p>
</section>

<ul class="award-index-list">
  {#each seasons as s (s.year)}
    <li><a href={`/awards/${s.year}/${seasonQS(s.year)}`}>{s.label} awards</a></li>
  {/each}
</ul>

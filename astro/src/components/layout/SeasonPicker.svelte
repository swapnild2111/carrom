<script lang="ts">
  // Season picker — fetches seasons from Firestore on mount and drives the
  // ?season=YYYY URL param, mirroring the old static/js/season-switch.js
  // behavior. Nav links carrying `data-season-link` get the season stamped
  // onto their href so navigation preserves the selection.
  import { onMount } from "svelte";
  import { listSeasons, resolveCurrentSeason } from "@/lib/firestore-reads";
  import type { Season } from "@/lib/firestore-schema";

  let seasons: Season[] = $state([]);
  let currentSeasonYear: number | null = $state(null);
  let requestedSeasonYear: number | null = $state(null);
  let loaded = $state(false);

  onMount(async () => {
    seasons = (await listSeasons()).filter((s) => s.available !== false);
    currentSeasonYear = resolveCurrentSeason(seasons);
    const urlSeason = new URLSearchParams(location.search).get("season");
    requestedSeasonYear = urlSeason ? parseInt(urlSeason, 10) : currentSeasonYear;
    if (!seasons.some((s) => s.year === requestedSeasonYear)) {
      requestedSeasonYear = currentSeasonYear;
    }
    loaded = true;
    applyToDom();
  });

  function navigateToSeason(year: number) {
    const url = new URL(location.href);
    url.searchParams.set("season", String(year));
    location.href = url.toString();
  }

  function applyToDom() {
    if (!requestedSeasonYear) return;
    const label = seasons.find((s) => s.year === requestedSeasonYear)?.label ?? String(requestedSeasonYear);
    document.querySelectorAll<HTMLElement>("[data-season-label]").forEach((el) => {
      el.textContent = label;
    });
    document.querySelectorAll<HTMLAnchorElement>("a[data-season-link]").forEach((a) => {
      const u = new URL(a.href, location.origin);
      u.searchParams.set("season", String(requestedSeasonYear));
      a.setAttribute("href", u.pathname + u.search + u.hash);
    });
    document.documentElement.setAttribute("data-season", String(requestedSeasonYear));
  }
</script>

{#if loaded && requestedSeasonYear != null}
  <label class="season-picker-label">
    <span class="sr-only">Season</span>
    <select
      class="season-picker-select"
      value={requestedSeasonYear}
      onchange={(e) => navigateToSeason(parseInt((e.currentTarget as HTMLSelectElement).value, 10))}
    >
      {#each seasons as s (s.year)}
        <option value={s.year}>{s.label}{s.year === currentSeasonYear ? " · current" : ""}</option>
      {/each}
    </select>
  </label>
{/if}

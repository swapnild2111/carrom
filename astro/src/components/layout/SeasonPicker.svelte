<script lang="ts">
  // Season picker — options are baked into the page at build time (passed as a
  // prop from SiteHeader.astro), so the <select> renders synchronously.
  //
  // Navigation uses Astro View Transitions (via <ClientRouter /> in the layout):
  // clicking a season triggers a soft SPA-style navigation with a crossfade,
  // no full page reload, no white flash. `navigate()` is imported dynamically
  // so this island still renders on non-transition contexts if needed.
  import { onMount } from "svelte";
  import { resolveCurrentSeason } from "@/lib/firestore-reads";
  import type { Season } from "@/lib/firestore-schema";

  interface Props { seasons: Season[] }
  let { seasons }: Props = $props();

  const currentSeasonYear = resolveCurrentSeason(seasons);

  function readSeasonFromUrl(): number {
    const urlSeason = typeof location !== "undefined" ? new URLSearchParams(location.search).get("season") : null;
    const parsed = urlSeason ? parseInt(urlSeason, 10) : NaN;
    return seasons.some((s) => s.year === parsed) ? parsed : currentSeasonYear;
  }

  // Reactive so the <select> updates when the URL changes via ClientRouter.
  let requestedSeasonYear: number = $state(readSeasonFromUrl());

  onMount(() => {
    applyToDom();
    const onNavigate = () => {
      requestedSeasonYear = readSeasonFromUrl();
      applyToDom();
    };
    document.addEventListener("astro:page-load", onNavigate);
    return () => document.removeEventListener("astro:page-load", onNavigate);
  });

  async function navigateToSeason(year: number) {
    const url = new URL(location.href);
    url.searchParams.set("season", String(year));
    try {
      const { navigate } = await import("astro:transitions/client");
      navigate(url.pathname + url.search);
    } catch {
      // If the transitions runtime isn't available (dev-time edge case), fall back.
      location.href = url.toString();
    }
  }

  function applyToDom() {
    const urlNow = new URLSearchParams(location.search).get("season");
    const parsedNow = urlNow ? parseInt(urlNow, 10) : NaN;
    const activeYear = seasons.some((s) => s.year === parsedNow) ? parsedNow : currentSeasonYear;
    const label = seasons.find((s) => s.year === activeYear)?.label ?? String(activeYear);
    document.querySelectorAll<HTMLElement>("[data-season-label]").forEach((el) => {
      el.textContent = label;
    });
    document.querySelectorAll<HTMLAnchorElement>("a[data-season-link]").forEach((a) => {
      const u = new URL(a.href, location.origin);
      u.searchParams.set("season", String(activeYear));
      a.setAttribute("href", u.pathname + u.search + u.hash);
    });
    document.documentElement.setAttribute("data-season", String(activeYear));

    // Highlight the nav tab whose pathname matches the current route.
    // Leaderboard = "/", Clubs = "/clubs/*", Awards = "/awards/*", Admin = "/admin/*".
    const currentPath = location.pathname;
    document.querySelectorAll<HTMLAnchorElement>(".header-nav .nav-link").forEach((a) => {
      const linkPath = new URL(a.href, location.origin).pathname;
      const isHome = linkPath === "/" || linkPath === "";
      const active = isHome
        ? currentPath === "/" || currentPath === ""
        : currentPath === linkPath || currentPath.startsWith(linkPath.endsWith("/") ? linkPath : `${linkPath}/`);
      a.classList.toggle("is-active", active);
    });
  }
</script>

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


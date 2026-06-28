(function () {
  "use strict";

  const select = document.getElementById("season-year");
  const config = window.CARROM_SEASONS;
  if (!select || !config) return;

  const defaultYear = String(config.defaultYear);
  const available = config.seasons.filter((s) => s.available);
  const singleSeason = available.length <= 1;

  function applyYear(year) {
    const headerLabel = document.getElementById("header-season-label");
    const footerLabel = document.getElementById("footer-season-label");
    if (headerLabel) headerLabel.textContent = `${year} season`;
    if (footerLabel) footerLabel.textContent = year;
    document.documentElement.dataset.season = year;
  }

  // Only 2025 data exists — always default to configured season.
  const activeYear = singleSeason ? String(available[0]?.year || defaultYear) : defaultYear;

  select.value = activeYear;
  applyYear(activeYear);

  if (singleSeason) {
    select.disabled = true;
    select.title = "Only the 2025 season is available right now";
    select.setAttribute("aria-label", "Season year (2025 only)");
    return;
  }

  select.addEventListener("change", () => {
    const year = select.value;
    const season = available.find((s) => String(s.year) === year);
    if (!season) {
      select.value = activeYear;
      return;
    }
    applyYear(year);
  });
})();

(function () {
  const search = document.getElementById("player-search");
  const filter = document.getElementById("player-filter");
  const directory = document.getElementById("players-directory");
  const empty = document.getElementById("players-empty");
  if (!search || !directory) return;

  const cards = Array.from(directory.querySelectorAll(".player-card"));

  function applyFilters() {
    const query = search.value.trim().toLowerCase();
    const source = filter ? filter.value : "all";
    let visible = 0;

    cards.forEach((card) => {
      const haystack = [
        card.dataset.name || "",
        card.dataset.district || "",
        card.dataset.club || "",
      ].join(" ");
      const sources = card.dataset.sources || "";
      const matchesQuery = !query || haystack.includes(query);
      const matchesSource =
        source === "all" ||
        (source === "podium" && sources.includes("ranking")) ||
        sources.includes(source);
      const show = matchesQuery && matchesSource;
      card.hidden = !show;
      if (show) visible += 1;
    });

    if (empty) empty.hidden = visible > 0;
  }

  search.addEventListener("input", applyFilters);
  if (filter) filter.addEventListener("change", applyFilters);
})();

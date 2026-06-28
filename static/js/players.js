(function () {
  "use strict";

  const INITIAL_VISIBLE = 30;
  const search = document.getElementById("player-search");
  const filter = document.getElementById("player-filter");
  const clearBtn = document.getElementById("player-search-clear");
  const directory = document.getElementById("players-directory");
  const empty = document.getElementById("players-empty");
  const countEl = document.getElementById("players-count");
  const showMoreBtn = document.getElementById("players-show-more");
  if (!search || !directory) return;

  const cards = Array.from(directory.querySelectorAll(".player-card"));
  let showAll = false;

  function isFiltering() {
    const query = search.value.trim();
    const source = filter ? filter.value : "all";
    return Boolean(query) || source !== "all";
  }

  function applyFilters() {
    const query = search.value.trim().toLowerCase();
    const source = filter ? filter.value : "all";
    const filtering = isFiltering();
    let matched = 0;
    let visible = 0;
    let visibleRank = 0;

    cards.forEach((card) => {
      const haystack = [
        card.dataset.name || "",
        card.dataset.district || "",
        card.dataset.club || "",
        card.dataset.aliases || "",
      ].join(" ");
      const sources = card.dataset.sources || "";
      const matchesQuery = !query || haystack.includes(query);
      const matchesSource =
        source === "all" ||
        (source === "podium" && sources.includes("ranking")) ||
        sources.includes(source);
      const isMatch = matchesQuery && matchesSource;

      if (!isMatch) {
        card.hidden = true;
        card.classList.remove("is-truncated");
        return;
      }

      matched += 1;
      let show = true;

      if (!filtering && !showAll) {
        visibleRank += 1;
        show = visibleRank <= INITIAL_VISIBLE;
        card.classList.toggle("is-truncated", visibleRank > INITIAL_VISIBLE);
      } else {
        card.classList.remove("is-truncated");
      }

      card.hidden = !show;
      if (show) visible += 1;
    });

    if (empty) empty.hidden = matched > 0;
    if (countEl) {
      if (filtering) {
        countEl.textContent = `${matched} of ${cards.length} players`;
      } else if (showAll) {
        countEl.textContent = `Showing all ${matched} players`;
      } else {
        countEl.textContent = `Top ${Math.min(INITIAL_VISIBLE, matched)} of ${matched} ranked · search to find anyone`;
      }
    }
    if (showMoreBtn) {
      showMoreBtn.hidden = filtering || showAll || matched <= INITIAL_VISIBLE;
    }
    if (clearBtn) clearBtn.hidden = !query;
  }

  function focusPlayer(query) {
    if (!query) return;
    search.value = query;
    showAll = true;
    applyFilters();
    const normalized = query.toLowerCase();
    const match = cards.find((card) => (card.dataset.name || "").includes(normalized));
    if (match) {
      match.hidden = false;
      match.open = true;
      match.scrollIntoView({ behavior: "smooth", block: "center" });
      match.classList.add("is-highlighted");
      window.setTimeout(() => match.classList.remove("is-highlighted"), 2000);
    }
    search.focus();
  }

  window.carromFocusPlayer = focusPlayer;

  // Accordion: one open player card at a time
  cards.forEach((card) => {
    card.addEventListener("toggle", () => {
      if (!card.open) return;
      cards.forEach((other) => {
        if (other !== card) other.open = false;
      });
    });
  });

  search.addEventListener("input", applyFilters);
  if (filter) filter.addEventListener("change", applyFilters);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      search.value = "";
      search.focus();
      applyFilters();
    });
  }

  if (showMoreBtn) {
    showMoreBtn.addEventListener("click", () => {
      showAll = true;
      applyFilters();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== search) {
      const panel = document.getElementById("panel-players");
      if (panel && !panel.hidden) {
        event.preventDefault();
        search.focus();
      }
    }
    if (event.key === "Escape" && document.activeElement === search) {
      search.value = "";
      applyFilters();
      search.blur();
    }
  });

  const params = new URLSearchParams(location.search);
  applyFilters();
  if (params.get("q")) focusPlayer(params.get("q"));
})();

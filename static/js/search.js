(function () {
  "use strict";

  const input = document.getElementById("player-search");
  const table = document.getElementById("leaderboard-table");
  if (!input || !table) return;

  const rows = [...table.querySelectorAll("tbody tr")];

  function filter() {
    const query = input.value.trim().toLowerCase();
    rows.forEach((row) => {
      const haystack = row.getAttribute("data-search") || "";
      row.hidden = query && !haystack.includes(query);
    });
  }

  input.addEventListener("input", filter);

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
  });
})();

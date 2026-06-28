(() => {
  "use strict";

  const VALID_TABS = ["players", "total", "state"];
  const tabs = Array.from(document.querySelectorAll(".view-tab"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  const sticky = document.querySelector(".tabs-sticky");

  function activate(tabName, { updateHash = true, scroll = true } = {}) {
    if (!VALID_TABS.includes(tabName)) tabName = "players";

    tabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      const active = panel.id === `panel-${tabName}`;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (updateHash && location.hash !== `#${tabName}`) {
      history.replaceState(null, "", `#${tabName}`);
    }

    if (scroll && sticky) {
      sticky.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (tabName === "state" && window.initStateCharts && !window.stateChartsReady) {
      window.initStateCharts();
    }

    if (tabName === "total" && window.initCharts && !window.chartsReady) {
      window.initCharts();
    }
  }

  window.carromActivateTab = activate;

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));

    tab.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        event.preventDefault();
        next.focus();
        activate(next.dataset.tab);
      }
    });
  });

  document.querySelectorAll(".player-link").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const query = button.dataset.player || "";
      activate("players", { scroll: true });
      window.carromFocusPlayer?.(query);
    });
  });

  const initialTab = location.hash.replace("#", "").split("?")[0];
  activate(VALID_TABS.includes(initialTab) ? initialTab : "players", {
    updateHash: false,
    scroll: false,
  });

  window.addEventListener("hashchange", () => {
    const tab = location.hash.replace("#", "").split("?")[0];
    if (VALID_TABS.includes(tab)) activate(tab, { updateHash: false, scroll: true });
  });
})();

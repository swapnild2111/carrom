(() => {
  "use strict";

  const tabs = document.querySelectorAll(".view-tab");
  const panels = document.querySelectorAll(".tab-panel");

  function activate(tabName) {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    panels.forEach((panel) => {
      const active = panel.id === `panel-${tabName}`;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (tabName === "state" && window.initStateCharts && !window.stateChartsReady) {
      window.initStateCharts();
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  });
})();

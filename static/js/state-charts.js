(() => {
  "use strict";

  window.stateChartsReady = false;

  const COLORS = {
    white: "#f5f0e6",
    whiteBg: "rgba(245, 240, 230, 0.85)",
    black: "#1a1a1a",
    blackBg: "rgba(201, 162, 39, 0.85)",
    state: "#a78bfa",
    grid: "rgba(139, 156, 179, 0.15)",
    text: "#8b9cb3",
  };

  function shortTournamentName(name) {
    return name.length > 32 ? `${name.slice(0, 30)}…` : name;
  }

  function shortName(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  async function loadStateData() {
    let url = window.STATE_CHART_URL;
    if (!url) return null;
    url = url.trim().replace(/^["']+|["']+$/g, "");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load state data (${response.status})`);
    return response.json();
  }

  function showFallback(panelSelector, message) {
    document.querySelectorAll(`${panelSelector} .chart-wrap`).forEach((wrap) => {
      if (wrap.querySelector(".chart-fallback")) return;
      const msg = document.createElement("p");
      msg.className = "chart-fallback";
      msg.textContent = message;
      wrap.appendChild(msg);
    });
  }

  window.initStateCharts = async function initStateCharts() {
    if (window.stateChartsReady || typeof Chart === "undefined") return;

    let data;
    try {
      data = await loadStateData();
    } catch {
      showFallback(".state-charts", "Could not load state circuit data.");
      return;
    }

    const tournaments = [...data.tournaments].sort((a, b) => b.totals.all - a.totals.all);
    const districts = [...data.districts].sort((a, b) => b.totals.all - a.totals.all);
    const topPlayers = [...data.players]
      .sort((a, b) => b.totals.all - a.totals.all)
      .slice(0, 10);

    Chart.defaults.color = COLORS.text;
    Chart.defaults.borderColor = COLORS.grid;

    new Chart(document.getElementById("chart-state-tournaments"), {
      type: "bar",
      data: {
        labels: tournaments.map((t) => shortTournamentName(t.name)),
        datasets: [
          {
            label: "White",
            data: tournaments.map((t) => t.totals.white),
            backgroundColor: COLORS.whiteBg,
            borderColor: COLORS.white,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Black",
            data: tournaments.map((t) => t.totals.black),
            backgroundColor: COLORS.blackBg,
            borderColor: COLORS.black,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: COLORS.grid }, ticks: { stepSize: 2 } },
        },
        plugins: {
          legend: { labels: { color: COLORS.text } },
          tooltip: {
            callbacks: {
              title: (items) => tournaments[items[0].dataIndex].name,
            },
          },
        },
      },
    });

    new Chart(document.getElementById("chart-state-districts"), {
      type: "doughnut",
      data: {
        labels: districts.map((d) => d.name),
        datasets: [
          {
            data: districts.map((d) => d.totals.all),
            backgroundColor: [
              "rgba(74, 158, 255, 0.75)",
              "rgba(167, 139, 250, 0.75)",
              "rgba(245, 240, 230, 0.75)",
              "rgba(201, 162, 39, 0.75)",
              "rgba(120, 180, 120, 0.75)",
              "rgba(200, 120, 120, 0.75)",
            ],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: { position: "bottom", labels: { color: COLORS.text } },
        },
      },
    });

    new Chart(document.getElementById("chart-state-top-players"), {
      type: "bar",
      data: {
        labels: topPlayers.map((p) => shortName(p.name)),
        datasets: [
          {
            label: "White",
            data: topPlayers.map((p) => p.totals.white),
            backgroundColor: COLORS.whiteBg,
            borderRadius: 4,
          },
          {
            label: "Black",
            data: topPlayers.map((p) => p.totals.black),
            backgroundColor: COLORS.blackBg,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: { stacked: true, grid: { color: COLORS.grid } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: { legend: { labels: { color: COLORS.text } } },
      },
    });

    window.stateChartsReady = true;
  };
})();

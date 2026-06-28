(() => {
  "use strict";

  const COLORS = {
    white: "#f5f0e6",
    whiteBg: "rgba(245, 240, 230, 0.85)",
    black: "#1a1a1a",
    blackBg: "rgba(201, 162, 39, 0.85)",
    club: "#4a9eff",
    clubBg: "rgba(74, 158, 255, 0.75)",
    state: "#a78bfa",
    stateBg: "rgba(167, 139, 250, 0.75)",
    grid: "rgba(139, 156, 179, 0.15)",
    text: "#8b9cb3",
  };

  const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: COLORS.text, boxWidth: 12, padding: 14 },
      },
    },
  };

  function loadData() {
    const el = document.getElementById("achievements-data");
    if (!el) return null;
    return JSON.parse(el.textContent);
  }

  function topPlayers(players, n = 10) {
    return [...players]
      .sort((a, b) => b.totals.all - a.totals.all || b.totals.white - a.totals.white)
      .slice(0, n);
  }

  function shortName(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 2) return name;
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }

  function initCharts() {
    const data = loadData();
    if (!data || typeof Chart === "undefined") return;

    const top = topPlayers(data.players);
    const labels = top.map((p) => shortName(p.name));

    Chart.defaults.color = COLORS.text;
    Chart.defaults.borderColor = COLORS.grid;
    Chart.defaults.font.family = "system-ui, -apple-system, sans-serif";

    new Chart(document.getElementById("chart-top-players"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "White",
            data: top.map((p) => p.totals.white),
            backgroundColor: COLORS.whiteBg,
            borderColor: COLORS.white,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Black",
            data: top.map((p) => p.totals.black),
            backgroundColor: COLORS.blackBg,
            borderColor: COLORS.black,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: "y",
        scales: {
          x: {
            stacked: true,
            grid: { color: COLORS.grid },
            ticks: { stepSize: 1 },
          },
          y: {
            stacked: true,
            grid: { display: false },
          },
        },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { position: "top", labels: { color: COLORS.text } },
        },
      },
    });

    new Chart(document.getElementById("chart-white-black"), {
      type: "doughnut",
      data: {
        labels: ["White", "Black"],
        datasets: [
          {
            data: [data.summary.totals.white, data.summary.totals.black],
            backgroundColor: [COLORS.whiteBg, COLORS.blackBg],
            borderColor: [COLORS.white, COLORS.black],
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: "62%",
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { position: "bottom" },
        },
      },
    });

    const clubTotal = data.summary.club.white + data.summary.club.black;
    const stateTotal = data.summary.state.white + data.summary.state.black;

    new Chart(document.getElementById("chart-tier"), {
      type: "bar",
      data: {
        labels: ["Club matches", "State & YouTube"],
        datasets: [
          {
            label: "White",
            data: [data.summary.club.white, data.summary.state.white],
            backgroundColor: COLORS.whiteBg,
            borderColor: COLORS.white,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Black",
            data: [data.summary.club.black, data.summary.state.black],
            backgroundColor: COLORS.blackBg,
            borderColor: COLORS.black,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: COLORS.grid },
            ticks: { stepSize: 5 },
          },
        },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            callbacks: {
              footer: (items) => {
                const idx = items[0].dataIndex;
                const total = idx === 0 ? clubTotal : stateTotal;
                return `Tier total: ${total}`;
              },
            },
          },
        },
      },
    });

    new Chart(document.getElementById("chart-stacked"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Club · White",
            data: top.map((p) => p.slams.club.white),
            backgroundColor: "rgba(74, 158, 255, 0.55)",
            borderRadius: 2,
          },
          {
            label: "Club · Black",
            data: top.map((p) => p.slams.club.black),
            backgroundColor: "rgba(74, 158, 255, 0.9)",
            borderRadius: 2,
          },
          {
            label: "State · White",
            data: top.map((p) => p.slams.state.white),
            backgroundColor: "rgba(167, 139, 250, 0.55)",
            borderRadius: 2,
          },
          {
            label: "State · Black",
            data: top.map((p) => p.slams.state.black),
            backgroundColor: "rgba(167, 139, 250, 0.9)",
            borderRadius: 2,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            grid: { color: COLORS.grid },
            ticks: { stepSize: 2 },
          },
        },
        plugins: {
          ...CHART_DEFAULTS.plugins,
          legend: { position: "top" },
        },
      },
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCharts);
  } else {
    initCharts();
  }
})();

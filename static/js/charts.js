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

  function parseEmbeddedData(raw) {
    if (raw == null) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw !== "string") return null;
    try {
      let data = JSON.parse(raw);
      if (typeof data === "string") data = JSON.parse(data);
      return typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

  async function loadData() {
    const embedded = parseEmbeddedData(window.CARROM_DATA);
    if (embedded) return embedded;

    const url = window.CARROM_CHART_URL;
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load chart data (${response.status})`);
    return response.json();
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

  function showChartFallback(message) {
    document.querySelectorAll(".chart-wrap").forEach((wrap) => {
      if (wrap.querySelector(".chart-fallback")) return;
      const msg = document.createElement("p");
      msg.className = "chart-fallback";
      msg.textContent = message;
      wrap.appendChild(msg);
    });
  }

  async function initCharts() {
    let data;
    try {
      data = await loadData();
    } catch {
      showChartFallback("Could not load chart data.");
      return;
    }

    if (!data || typeof Chart === "undefined") {
      showChartFallback(data ? "Charts library failed to load." : "Chart data unavailable.");
      return;
    }

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
            label: "White slams",
            data: top.map((p) => p.totals.white),
            backgroundColor: COLORS.whiteBg,
            borderColor: COLORS.white,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Black slams",
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
        labels: ["White slams", "Black slams"],
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
            label: "White slams",
            data: [data.summary.club.white, data.summary.state.white],
            backgroundColor: COLORS.whiteBg,
            borderColor: COLORS.white,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: "Black slams",
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
            label: "State/YouTube · White",
            data: top.map((p) => p.slams.state.white),
            backgroundColor: "rgba(167, 139, 250, 0.55)",
            borderRadius: 2,
          },
          {
            label: "State/YouTube · Black",
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
    document.addEventListener("DOMContentLoaded", () => {
      initCharts();
    });
  } else {
    initCharts();
  }
})();

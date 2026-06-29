(function () {
  "use strict";

  var dataEl = document.getElementById("home-chart-data");
  if (!dataEl || typeof Chart === "undefined") return;

  var payload;
  try {
    payload = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  var muted = "#8b9cb3";
  var border = "#2d3a4f";
  var whiteColor = "#f5f0e6";
  var blackColor = "#c9a227";
  var accent = "#4a9eff";

  Chart.defaults.color = muted;
  Chart.defaults.borderColor = border;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  var topCanvas = document.getElementById("chart-top-players");
  if (topCanvas && payload.topPlayers && payload.topPlayers.length) {
    var names = payload.topPlayers.map(function (p) {
      return p.name;
    });
    var whites = payload.topPlayers.map(function (p) {
      return p.white;
    });
    var blacks = payload.topPlayers.map(function (p) {
      return p.black;
    });

    new Chart(topCanvas, {
      type: "bar",
      data: {
        labels: names,
        datasets: [
          {
            label: "White slams",
            data: whites,
            backgroundColor: whiteColor,
            borderRadius: 4,
            stack: "slams",
          },
          {
            label: "Black slams",
            data: blacks,
            backgroundColor: blackColor,
            borderRadius: 4,
            stack: "slams",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, padding: 16 },
          },
          tooltip: {
            callbacks: {
              footer: function (items) {
                var sum = items.reduce(function (acc, item) {
                  return acc + item.parsed.x;
                }, 0);
                return "Total: " + sum;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: "rgba(45, 58, 79, 0.6)" },
            ticks: { precision: 0 },
          },
          y: {
            stacked: true,
            grid: { display: false },
          },
        },
      },
    });
  }

  var splitCanvas = document.getElementById("chart-white-black");
  if (splitCanvas && payload.totals) {
    new Chart(splitCanvas, {
      type: "doughnut",
      data: {
        labels: ["White slams", "Black slams"],
        datasets: [
          {
            data: [payload.totals.white, payload.totals.black],
            backgroundColor: [whiteColor, blackColor],
            borderColor: ["#1a2332", "#1a2332"],
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, padding: 16 },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var total = payload.totals.all || payload.totals.white + payload.totals.black;
                var pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
                return ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
              },
            },
          },
        },
      },
      plugins: [
        {
          id: "centerText",
          beforeDraw: function (chart) {
            var total = payload.totals.all;
            if (!total) return;
            var ctx = chart.ctx;
            var meta = chart.getDatasetMeta(0);
            if (!meta.data.length) return;
            var center = meta.data[0];
            var x = center.x;
            var y = center.y;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#e8edf4";
            ctx.font = "700 1.5rem system-ui, sans-serif";
            ctx.fillText(String(total), x, y - 8);
            ctx.fillStyle = muted;
            ctx.font = "500 0.75rem system-ui, sans-serif";
            ctx.fillText("total slams", x, y + 14);
            ctx.restore();
          },
        },
      ],
    });
  }

  var paceCanvas = document.getElementById("chart-leaders-pace");
  if (paceCanvas && payload.topPlayers && payload.topPlayers.length >= 3) {
    var top3 = payload.topPlayers.slice(0, 3);
    new Chart(paceCanvas, {
      type: "radar",
      data: {
        labels: ["White", "Black", "Total"],
        datasets: top3.map(function (p, i) {
          var colors = [accent, "#a78bfa", "#34d399"];
          return {
            label: p.name,
            data: [p.white, p.black, p.total],
            borderColor: colors[i],
            backgroundColor: colors[i] + "33",
            borderWidth: 2,
            pointRadius: 3,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, padding: 12 },
          },
        },
        scales: {
          r: {
            angleLines: { color: border },
            grid: { color: "rgba(45, 58, 79, 0.7)" },
            pointLabels: { font: { size: 11 } },
            ticks: { display: false, stepSize: 5 },
          },
        },
      },
    });
  }
})();

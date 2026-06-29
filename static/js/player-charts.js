(function () {
  "use strict";

  var dataEl = document.getElementById("player-chart-data");
  var canvas = document.getElementById("player-chart-mix");
  if (!dataEl || !canvas || typeof Chart === "undefined") return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  if (!data.total) return;

  var whiteColor = "#f5f0e6";
  var blackColor = "#c9a227";
  var muted = "#8b9cb3";

  Chart.defaults.color = muted;
  Chart.defaults.borderColor = "#2d3a4f";
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["White", "Black"],
      datasets: [
        {
          data: [data.white, data.black],
          backgroundColor: [whiteColor, blackColor],
          borderColor: ["#1a2332", "#1a2332"],
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var pct = data.total ? Math.round((ctx.parsed / data.total) * 100) : 0;
              return ctx.label + ": " + ctx.parsed + " (" + pct + "%)";
            },
          },
        },
      },
    },
    plugins: [
      {
        id: "playerCenterTotal",
        beforeDraw: function (chart) {
          var ctx = chart.ctx;
          var meta = chart.getDatasetMeta(0);
          if (!meta.data.length) return;
          var center = meta.data[0];
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#e8edf4";
          ctx.font = "700 1.35rem system-ui, sans-serif";
          ctx.fillText(String(data.total), center.x, center.y - 6);
          ctx.fillStyle = muted;
          ctx.font = "500 0.68rem system-ui, sans-serif";
          ctx.fillText("slams", center.x, center.y + 12);
          ctx.restore();
        },
      },
    ],
  });
})();

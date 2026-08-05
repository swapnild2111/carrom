(function () {
  "use strict";

  var picker = document.getElementById("season-picker");
  if (!picker) return;

  var currentSeason = parseInt(picker.getAttribute("data-current-season"), 10);
  var params = new URLSearchParams(window.location.search);
  var requested = params.get("season");
  var requestedSeason = requested ? parseInt(requested, 10) : currentSeason;

  var seasonLabel = "";
  var options = picker.querySelectorAll("option");
  for (var i = 0; i < options.length; i++) {
    if (parseInt(options[i].value, 10) === requestedSeason) {
      options[i].selected = true;
      seasonLabel = options[i].textContent;
      break;
    }
  }

  var isDifferent = requestedSeason && requestedSeason !== currentSeason;
  // Stamp season on cross-page nav links whenever a season is chosen via
  // the URL, so navigating home → admin → clubs keeps the selection sticky
  // even when the user picked the landing season explicitly.
  var stampSeason = Boolean(requested);

  picker.addEventListener("change", function () {
    navigateToSeason(parseInt(picker.value, 10));
  });

  function navigateToSeason(val) {
    var url = new URL(window.location.href);
    url.searchParams.set("season", String(val));
    window.location.href = url.toString();
  }


  var links = document.querySelectorAll("a[data-season-link]");
  for (var j = 0; j < links.length; j++) {
    var link = links[j];
    if (link.hasAttribute("data-season-awards")) {
      var href = link.getAttribute("href") || "";
      link.setAttribute("href", href.replace(/\/awards\/\d+\//, "/awards/" + requestedSeason + "/"));
    }
    if (stampSeason) {
      var url = new URL(link.href, window.location.origin);
      url.searchParams.set("season", String(requestedSeason));
      link.setAttribute("href", url.pathname + url.search + url.hash);
    }
  }

  if (isDifferent) {
    document.documentElement.setAttribute("data-season", String(requestedSeason));
    swapHomePageIfPresent(requestedSeason, seasonLabel);
    swapAwardsPageIfPresent(requestedSeason);
  }

  function fetchJson(path) {
    var siteBase = document.querySelector("link[rel=icon]");
    var baseHref = siteBase ? siteBase.getAttribute("href").replace(/images\/.*$/, "") : "/";
    return fetch(baseHref + "data/generated/" + path).then(function (r) {
      if (!r.ok) throw new Error("failed to load " + path);
      return r.json();
    });
  }

  function swapHomePageIfPresent(season, label) {
    var table = document.getElementById("leaderboard-table");
    if (!table) return;

    var leaderboardData = null;
    var clubsData = null;

    function tryRender() {
      renderChartsFromLeaderboard(leaderboardData || { players: [] }, clubsData || { clubs: [] });
    }

    fetchJson("leaderboard-" + season + ".json").then(function (lb) {
      leaderboardData = lb;
      renderLeaderboard(lb, label);
      tryRender();
    }).catch(function () {
      showEmptyBanner(label);
      tryRender();
    });

    fetchJson("clubs_enriched-" + season + ".json").then(function (ce) {
      clubsData = ce;
      tryRender();
    }).catch(function () {
      clubsData = { clubs: [] };
      tryRender();
    });

    fetchJson("awards-" + season + ".json").then(function (awards) {
      renderAwardsPreview(awards);
    }).catch(function () {
      renderAwardsPreview({ maxWhiteSlams: [], maxBlackSlams: [] });
    });
  }

  function renderChartsFromLeaderboard(lb, ce) {
    if (typeof window.renderHomeCharts !== "function") return;
    var players = (lb && lb.players) || [];
    var totalWhite = 0, totalBlack = 0;
    for (var i = 0; i < players.length; i++) {
      totalWhite += players[i].stats.white;
      totalBlack += players[i].stats.black;
    }
    var topPlayers = players.slice()
      .sort(function (a, b) { return b.stats.total - a.stats.total; })
      .slice(0, 10)
      .map(function (p) {
        return { name: p.name, white: p.stats.white, black: p.stats.black, total: p.stats.total };
      });
    var clubs = ((ce && ce.clubs) || []).map(function (c) {
      return { name: c.name, white: c.stats.white, black: c.stats.black, total: c.stats.total };
    });
    window.renderHomeCharts({
      totals: { white: totalWhite, black: totalBlack, all: totalWhite + totalBlack },
      topPlayers: topPlayers,
      clubs: clubs,
    });
  }

  function renderLeaderboard(lb, label) {
    var players = lb.players || [];
    var tbody = document.querySelector("#leaderboard-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var tr = document.createElement("tr");
      tr.setAttribute("data-search", (p.name || "").toLowerCase() + " " + ((p.aliases || []).join(" ").toLowerCase()));

      var rankCell = document.createElement("td");
      rankCell.className = "col-rank";
      var totalRank = p.ranks && p.ranks.total;
      if (totalRank) {
        if (totalRank <= 3) {
          rankCell.innerHTML = '<span class="rank-badge rank-' + totalRank + '" title="Rank ' + totalRank + '">' + totalRank + "</span>";
        } else {
          rankCell.innerHTML = '<span class="rank-num">' + totalRank + "</span>";
        }
      } else {
        rankCell.textContent = "—";
      }

      var playerCell = document.createElement("td");
      playerCell.className = "col-player";
      var playerLink = document.createElement("a");
      playerLink.href = "players/" + p.id + "/?season=" + lb.season;
      playerLink.textContent = p.name;
      playerCell.appendChild(playerLink);

      var whiteCell = document.createElement("td");
      whiteCell.className = "num col-white";
      whiteCell.textContent = p.stats.white;

      var blackCell = document.createElement("td");
      blackCell.className = "num col-black";
      blackCell.textContent = p.stats.black;

      var totalCell = document.createElement("td");
      totalCell.className = "num col-total";
      totalCell.innerHTML = "<strong>" + p.stats.total + "</strong>";

      tr.appendChild(rankCell);
      tr.appendChild(playerCell);
      tr.appendChild(whiteCell);
      tr.appendChild(blackCell);
      tr.appendChild(totalCell);
      tbody.appendChild(tr);
    }

    updateStatCards(lb, players);
    var labelEls = document.querySelectorAll("[data-season-label]");
    for (var m = 0; m < labelEls.length; m++) labelEls[m].textContent = label;
  }

  function updateStatCards(lb, players) {
    var totalWhite = 0, totalBlack = 0;
    for (var i = 0; i < players.length; i++) {
      totalWhite += players[i].stats.white;
      totalBlack += players[i].stats.black;
    }
    var whiteEl = document.querySelector(".stat-white .stat-value");
    var blackEl = document.querySelector(".stat-black .stat-value");
    var allEl = document.querySelector(".stat-total .stat-value");
    var playersEl = document.querySelector(".stat-players .stat-value");
    if (whiteEl) whiteEl.textContent = totalWhite;
    if (blackEl) blackEl.textContent = totalBlack;
    if (allEl) allEl.textContent = totalWhite + totalBlack;
    if (playersEl) playersEl.textContent = players.length;

    var stats = document.querySelector("[data-season-stats]");
    if (stats) stats.textContent = players.length + " players · " + (totalWhite + totalBlack) + " slams";

    // Toggle the stat-cards vs season-empty block based on whether the
    // target season has data. Also fill in the season's real date range.
    var hasData = (totalWhite + totalBlack) > 0;
    var statCards = document.querySelector(".stat-cards");
    var emptyBlock = document.querySelector(".season-empty");
    if (statCards) statCards.hidden = !hasData;
    if (emptyBlock) emptyBlock.hidden = hasData;

    if (!hasData) {
      var seasonMeta = findSeasonMeta();
      if (seasonMeta) {
        var startEl = document.querySelector("[data-season-range-start]");
        var endEl = document.querySelector("[data-season-range-end]");
        if (startEl && seasonMeta.start) startEl.textContent = seasonMeta.start;
        if (endEl && seasonMeta.end) endEl.textContent = seasonMeta.end;
      }
    }
  }

  function findSeasonMeta() {
    // Pull season start/end from the site_summary embedded in season-trend-data
    var trendEl = document.getElementById("season-trend-data");
    if (!trendEl) return null;
    try {
      var payload = JSON.parse(trendEl.textContent);
      var seasons = (payload && payload.seasons) || [];
      var current = parseInt((new URLSearchParams(window.location.search)).get("season"), 10);
      if (!current) return null;
      for (var i = 0; i < seasons.length; i++) {
        if (parseInt(seasons[i].year, 10) === current) return seasons[i];
      }
    } catch (_e) { /* ignore */ }
    return null;
  }

  function renderAwardsPreview(awards) {
    var whiteContainer = document.querySelector(".awards-race-white");
    var blackContainer = document.querySelector(".awards-race-black");
    if (!whiteContainer || !blackContainer) return;

    renderAwardsRaceCard(whiteContainer, awards.maxWhiteSlams, "white");
    renderAwardsRaceCard(blackContainer, awards.maxBlackSlams, "black");
  }

  function renderAwardsRaceCard(container, winners, kind) {
    var dot = kind === "white" ? "○" : "●";
    var head =
      '<header class="awards-race-head">' +
      '<span class="awards-race-dot" aria-hidden="true">' + dot + '</span>' +
      '<span class="awards-race-cat">Max ' + kind + ' slams</span>' +
      '</header>';
    var body = "";
    if (winners && winners.length) {
      for (var i = 0; i < winners.length; i++) {
        var w = winners[i];
        body +=
          '<p class="awards-race-winner">' +
          '<a href="players/' + w.slug + '/">' + w.name + '</a>' +
          '<span class="awards-race-count">' + w.count + '</span>' +
          '</p>';
      }
    } else {
      body = '<p class="awards-race-empty text-muted">No ' + kind + ' slams recorded yet this season.</p>';
    }
    container.innerHTML = head + body;
  }

  function showEmptyBanner(label) {
    var tbody = document.querySelector("#leaderboard-table tbody");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-muted,#8b9cb3);">No slams recorded for ' + label + ' yet.</td></tr>';
    updateStatCards({}, []);
  }

  function swapAwardsPageIfPresent(season) {
    var header = document.querySelector(".awards-page-header");
    if (!header) return;
    var url = window.location.pathname.replace(/\/awards\/\d+\//, "/awards/" + season + "/");
    if (url !== window.location.pathname) {
      window.location.href = url + window.location.search;
    }
  }
})();

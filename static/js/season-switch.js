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

  picker.addEventListener("change", function () {
    navigateToSeason(parseInt(picker.value, 10));
  });

  function navigateToSeason(val) {
    var url = new URL(window.location.href);
    if (val === currentSeason) {
      url.searchParams.delete("season");
    } else {
      url.searchParams.set("season", String(val));
    }
    window.location.href = url.toString();
  }


  var links = document.querySelectorAll("a[data-season-link]");
  for (var j = 0; j < links.length; j++) {
    var link = links[j];
    if (link.hasAttribute("data-season-awards")) {
      var href = link.getAttribute("href") || "";
      link.setAttribute("href", href.replace(/\/awards\/\d+\//, "/awards/" + requestedSeason + "/"));
    }
    if (isDifferent) {
      var url = new URL(link.href, window.location.origin);
      url.searchParams.set("season", String(requestedSeason));
      link.setAttribute("href", url.pathname + url.search + url.hash);
    }
  }

  if (isDifferent) {
    document.documentElement.setAttribute("data-season", String(requestedSeason));
    swapHomePageIfPresent(requestedSeason, seasonLabel);
    swapPlayerPageBannerIfPresent(seasonLabel, requestedSeason);
    swapClubPageBannerIfPresent(seasonLabel, requestedSeason);
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
  }

  function renderAwardsPreview(awards) {
    var whiteContainer = document.querySelector(".award-card-white");
    var blackContainer = document.querySelector(".award-card-black");
    if (!whiteContainer || !blackContainer) return;

    renderAwardRow(whiteContainer, awards.maxWhiteSlams, "white");
    renderAwardRow(blackContainer, awards.maxBlackSlams, "black");
  }

  function renderAwardRow(container, winners, kind) {
    var iconHtml = '<span class="award-preview-icon" aria-hidden="true">' + (kind === "white" ? "○" : "●") + "</span>";
    var heading = "<h4>Max " + kind + " slams</h4>";
    var body = "";
    if (winners && winners.length) {
      for (var i = 0; i < winners.length; i++) {
        var w = winners[i];
        body += '<p class="award-preview-row award-preview-winner"><a href="players/' + w.slug + '/">' + w.name + "</a> <strong>" + w.count + "</strong></p>";
      }
    } else {
      body = '<p class="text-muted">No slams recorded yet.</p>';
    }
    container.innerHTML = iconHtml + heading + body;
  }

  function showEmptyBanner(label) {
    var tbody = document.querySelector("#leaderboard-table tbody");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-muted,#8b9cb3);">No slams recorded for ' + label + ' yet.</td></tr>';
    updateStatCards({}, []);
  }

  function swapPlayerPageBannerIfPresent(label, season) {
    var hero = document.querySelector(".player-hero");
    if (!hero) return;
    insertSeasonBanner(hero, label, season, "player");
  }

  function swapClubPageBannerIfPresent(label, season) {
    var header = document.querySelector(".entity-header");
    if (!header) return;
    insertSeasonBanner(header, label, season, "club");
  }

  function swapAwardsPageIfPresent(season) {
    var header = document.querySelector(".awards-page-header");
    if (!header) return;
    var url = window.location.pathname.replace(/\/awards\/\d+\//, "/awards/" + season + "/");
    if (url !== window.location.pathname) {
      window.location.href = url + window.location.search;
    }
  }

  function insertSeasonBanner(anchor, label, season, kind) {
    var banner = document.createElement("div");
    banner.className = "season-banner";
    banner.setAttribute("role", "note");
    banner.innerHTML =
      '<span>Viewing <strong>' + label + '</strong> season. The stats on this ' + kind +
      ' page reflect the current season only.</span> ' +
      '<a href="./?season=' + season + '">Back to ' + label + ' leaderboard</a>';
    anchor.parentNode.insertBefore(banner, anchor);
  }
})();

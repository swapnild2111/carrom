(function () {
  "use strict";

  const config = window.CARROM_ADMIN || {};
  const TOKEN_KEY = "carrom_admin_token";
  const USER_KEY = "carrom_admin_user";

  const loginEl = document.getElementById("admin-login");
  const deniedEl = document.getElementById("admin-denied");
  const appEl = document.getElementById("admin-app");
  const statusEl = document.getElementById("admin-form-status");
  const loginError = document.getElementById("admin-login-error");

  let players = [];
  let clubs = [];
  let slams = [];
  let seasons = [];

  function slugify(name) {
    return name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/[-\s]+/g, "-")
      .replace(/^-|-$/g, "") || "player";
  }

  function hideAll() {
    [loginEl, deniedEl, appEl].forEach((el) => {
      if (el) el.hidden = true;
    });
  }

  function show(el) {
    hideAll();
    if (el) el.hidden = false;
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "admin-toast";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `admin-toast${type ? ` admin-status--${type}` : ""}`;
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    const labelEl = button.querySelector(".btn-label");
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = labelEl ? labelEl.textContent.trim() : button.textContent.trim();
    }
    button.disabled = loading;
    const text = loading ? loadingText : button.dataset.defaultLabel;
    if (labelEl) labelEl.textContent = text;
    else button.textContent = text;
  }

  function updateCatalogStats() {
    const el = document.getElementById("admin-catalog-stats");
    if (!el) return;
    const activeSlams = slams.filter((s) => s.active !== false).length;
    el.textContent = `${players.length} players · ${clubs.length} clubs · ${activeSlams} slams`;
  }

  function getStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url}`);
    return res.json();
  }

  async function fetchGitHubUser(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 401) throw new Error("Invalid or expired token");
    if (!res.ok) throw new Error("Could not verify GitHub account");
    return res.json();
  }

  async function isAllowedUser(login) {
    const allowlist = await fetchJson(config.allowlistUrl);
    return (allowlist.allowedUsers || []).includes(login);
  }

  async function createIssue(token, { title, labels, body }) {
    const [owner, repo] = config.repo.split("/");
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, labels, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || "Could not create GitHub issue");
    }
    return data;
  }

  function issueBody(fields, { always = [] } = {}) {
    return Object.entries(fields)
      .filter(
        ([label, value]) =>
          always.includes(label) ||
          (value !== undefined && value !== null && String(value).trim() !== ""),
      )
      .map(([label, value]) => `### ${label}\n\n${value}`)
      .join("\n\n");
  }

  const SEARCHABLE_SELECT_MIN = 5;

  function resetSelectFilter(select) {
    if (!select) return;
    const wrap = select.closest(".admin-select-wrap");
    const search = wrap?.querySelector(".admin-select-search");
    if (search) search.value = "";
    [...select.options].forEach((opt) => {
      opt.hidden = false;
    });
  }

  function filterSelectOptions(select, query) {
    if (!select) return;
    const q = query.trim().toLowerCase();
    [...select.options].forEach((opt) => {
      if (!opt.value && /^(select|all|—)/i.test(opt.textContent.trim())) {
        opt.hidden = false;
        return;
      }
      opt.hidden = q ? !opt.textContent.toLowerCase().includes(q) : false;
    });
  }

  function enhanceSearchableSelect(select, { minOptions = SEARCHABLE_SELECT_MIN } = {}) {
    if (!select) return;
    select.classList.add("admin-select");

    let wrap = select.closest(".admin-select-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "admin-select-wrap";
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(select);
    }

    let search = wrap.querySelector(".admin-select-search");
    const shouldSearch = select.options.length >= minOptions;

    if (shouldSearch && !search) {
      search = document.createElement("input");
      search.type = "search";
      search.className = "admin-select-search";
      search.placeholder = "Type to filter…";
      search.autocomplete = "off";
      search.setAttribute("aria-label", `Filter ${select.id || "options"}`);
      wrap.insertBefore(search, select);
      search.addEventListener("input", () => filterSelectOptions(select, search.value));
      select.addEventListener("focus", () => search.focus());
    } else if (!shouldSearch && search) {
      search.remove();
    }

    resetSelectFilter(select);
  }

  function setupMultiSelectFilter(selectId, searchId) {
    const select = document.getElementById(selectId);
    const search = document.getElementById(searchId);
    if (!select || !search || search.dataset.wired === "1") return;
    search.dataset.wired = "1";
    search.addEventListener("input", () => filterSelectOptions(select, search.value));
  }

  function enhanceAllSelects() {
    [
      "slam-player",
      "slam-club",
      "edit-filter-player",
      "player-gender",
      "slam-type",
      "slam-source",
      "edit-filter-type",
      "edit-action",
      "edit-type",
      "edit-source",
      "edit-player-action",
      "edit-player-gender",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.multiple) {
        el.classList.add("admin-select");
        return;
      }
      enhanceSearchableSelect(el);
    });
  }

  function populateSelect(select, options, { valueKey = "id", labelKey = "name", blank = false } = {}) {
    if (!select) return;
    select.innerHTML = "";
    if (blank) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Select…";
      select.appendChild(opt);
    }
    options.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = typeof item === "string" ? item : item[valueKey];
      opt.textContent = typeof item === "string" ? item : item[labelKey];
      select.appendChild(opt);
    });
  }

  function populateClubSelect(select, clubList, { blank = true, selectedId = "" } = {}) {
    if (!select) return;
    select.innerHTML = "";
    if (blank) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Select club…";
      select.appendChild(opt);
    }
    clubList.forEach((club) => {
      const opt = document.createElement("option");
      opt.value = club.id;
      opt.textContent = `${club.name} (${club.id})`;
      select.appendChild(opt);
    });
    if (selectedId && clubList.some((c) => c.id === selectedId)) {
      select.value = selectedId;
    } else if (!blank && clubList.length === 1) {
      select.value = clubList[0].id;
    }
  }

  function populatePlayerClubSelect() {
    const select = document.getElementById("player-clubs");
    const hint = document.getElementById("player-clubs-hint");
    if (!select) return;

    const selected = [...select.selectedOptions].map((opt) => opt.value);
    select.innerHTML = "";

    if (!clubs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No clubs yet — add a club first";
      opt.disabled = true;
      select.appendChild(opt);
      if (hint) hint.textContent = "Add a club in the Club tab before linking players.";
      return;
    }

    clubs.forEach((club) => {
      const opt = document.createElement("option");
      opt.value = club.id;
      opt.textContent = `${club.name} (${club.id})`;
      opt.selected = selected.includes(club.id);
      select.appendChild(opt);
    });

    if (hint) {
      hint.textContent = "Hold Ctrl/Cmd (Windows) or ⌘ (Mac) to select multiple clubs.";
    }
    const search = document.getElementById("player-clubs-search");
    if (search) search.value = "";
    [...select.options].forEach((opt) => {
      opt.hidden = false;
    });
  }

  function populateEditPlayerClubSelect(playerId) {
    const select = document.getElementById("edit-player-clubs");
    if (!select) return;

    const player = players.find((p) => p.id === playerId);
    const selected = player?.clubIds || [];
    select.innerHTML = "";

    if (!clubs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No clubs on file";
      opt.disabled = true;
      select.appendChild(opt);
      return;
    }

    clubs.forEach((club) => {
      const opt = document.createElement("option");
      opt.value = club.id;
      opt.textContent = `${club.name} (${club.id})`;
      opt.selected = selected.includes(club.id);
      select.appendChild(opt);
    });

    const search = document.getElementById("edit-player-clubs-search");
    if (search) search.value = "";
    [...select.options].forEach((opt) => {
      opt.hidden = false;
    });
  }

  function formatPlayerOption(player) {
    const clubNames = (player.clubIds || [])
      .map((id) => clubs.find((c) => c.id === id)?.name)
      .filter(Boolean);
    const suffix = clubNames.length ? ` · ${clubNames.join(", ")}` : "";
    return `${player.name}${suffix}`;
  }

  function clubsForPlayer(playerId) {
    if (!playerId) return clubs;
    const player = players.find((p) => p.id === playerId);
    if (!player?.clubIds?.length) return clubs;
    const linked = clubs.filter((c) => player.clubIds.includes(c.id));
    return linked.length ? linked : clubs;
  }

  function refreshSlamClubOptions({ preserveSelection = false } = {}) {
    const clubSelect = document.getElementById("slam-club");
    const playerSelect = document.getElementById("slam-player");
    const hint = document.getElementById("slam-club-hint");
    const source = document.getElementById("slam-source");
    if (!clubSelect || source?.value !== "club") return;

    const previous = preserveSelection ? clubSelect.value : "";
    const playerId = playerSelect?.value || "";
    const options = clubsForPlayer(playerId);
    const player = players.find((p) => p.id === playerId);
    const autoSelect = options.length === 1 ? options[0].id : previous;

    populateClubSelect(clubSelect, options, {
      blank: options.length !== 1,
      selectedId: autoSelect,
    });
    enhanceSearchableSelect(clubSelect);

    if (hint) {
      if (!playerId) {
        hint.textContent = "Select a player first — their clubs will be suggested here.";
      } else if (player?.clubIds?.length && options.length < clubs.length) {
        hint.textContent =
          options.length === 1
            ? `Auto-selected ${options[0].name} — this player's only club.`
            : `Showing ${options.length} clubs linked to this player.`;
      } else if (!player?.clubIds?.length) {
        hint.textContent = "This player has no club on file — pick any club.";
      } else {
        hint.textContent = "Select the club where this slam was recorded.";
      }
    }
  }

  let selectedEditSlamId = "";
  let selectedEditPlayerId = "";

  function sortedPlayers(list) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function playerMetaLine(player) {
    const parts = [player.id];
    if (player.aliases?.length) parts.push(player.aliases.join(", "));
    const clubNames = (player.clubIds || [])
      .map((id) => clubs.find((c) => c.id === id)?.name)
      .filter(Boolean);
    if (clubNames.length) parts.push(clubNames.join(", "));
    if (player.active === false) parts.push("inactive");
    return parts.filter(Boolean).join(" · ");
  }

  function filterEditPlayers() {
    const query = (document.getElementById("edit-player-search")?.value || "").trim().toLowerCase();
    if (!query) return sortedPlayers(players);
    return sortedPlayers(
      players.filter((player) => {
        const haystack = [
          player.id,
          player.name,
          player.gender,
          ...(player.aliases || []),
          ...(player.clubIds || []).map((id) => clubs.find((c) => c.id === id)?.name || id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      }),
    );
  }

  function clearEditPlayerSelection() {
    selectedEditPlayerId = "";
    const hidden = document.getElementById("edit-player-id");
    if (hidden) hidden.value = "";
    const preview = document.getElementById("edit-player-preview");
    if (preview) preview.hidden = true;
  }

  function fillEditPlayerForm(player) {
    const nameInput = document.getElementById("edit-player-name");
    const genderSelect = document.getElementById("edit-player-gender");
    const aliasesInput = document.getElementById("edit-player-aliases");
    if (nameInput) nameInput.value = player.name || "";
    if (genderSelect) {
      genderSelect.value = player.gender ? player.gender.charAt(0).toUpperCase() + player.gender.slice(1) : "Male";
    }
    if (aliasesInput) aliasesInput.value = (player.aliases || []).join(", ");
    populateEditPlayerClubSelect(player.id);
  }

  function renderEditPlayerPreview(player) {
    const preview = document.getElementById("edit-player-preview");
    const badge = document.getElementById("edit-player-preview-badge");
    const nameEl = document.getElementById("edit-player-preview-name");
    const idEl = document.getElementById("edit-player-preview-id");
    const details = document.getElementById("edit-player-details");
    if (!preview || !player) return;

    preview.hidden = false;
    if (badge) {
      badge.textContent = player.gender === "female" ? "F" : "M";
      badge.className = "entity-picker-badge";
    }
    if (nameEl) nameEl.textContent = player.name;
    if (idEl) idEl.textContent = `ID: ${player.id}`;

    if (details) {
      details.innerHTML = "";
      const clubNames = (player.clubIds || [])
        .map((id) => clubs.find((c) => c.id === id)?.name || id)
        .join(", ");
      const rows = [
        ["Gender", player.gender || "—"],
        ["Aliases", player.aliases?.length ? player.aliases.join(", ") : "—"],
        ["Clubs", clubNames || "—"],
        ["Status", player.active === false ? "Inactive" : "Active"],
      ];
      rows.forEach(([label, value]) => {
        const wrap = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        wrap.appendChild(dt);
        wrap.appendChild(dd);
        details.appendChild(wrap);
      });
    }

    updateEditPlayerActionState();
  }

  function selectEditPlayer(playerId) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    selectedEditPlayerId = playerId;
    const hidden = document.getElementById("edit-player-id");
    if (hidden) hidden.value = playerId;
    fillEditPlayerForm(player);
    renderEditPlayerPicker();
    renderEditPlayerPreview(player);
    renderPlayerSlamLog();
  }

  function currentSlamLogSeason() {
    const select = document.getElementById("edit-player-slamlog-season");
    if (select && select.value) return parseInt(select.value, 10);
    const currentYear = seasons.find((s) => s.available !== false)?.year;
    return currentYear ? parseInt(currentYear, 10) : new Date().getFullYear();
  }

  function playerSeasonSlams(playerId, season) {
    return slams.filter((s) => s.playerId === playerId && parseInt(s.season, 10) === parseInt(season, 10));
  }

  function slamHasDetail(slam) {
    return Boolean(slam.date || slam.videoUrl || slam.matchRef || slam.tournament || slam.notes);
  }

  function bestSeasonForPlayer(playerId) {
    if (!playerId) return null;
    const counts = {};
    slams.forEach((s) => {
      if (s.playerId !== playerId) return;
      const y = parseInt(s.season, 10);
      counts[y] = (counts[y] || 0) + 1;
    });
    const years = Object.keys(counts);
    if (!years.length) return null;
    years.sort((a, b) => counts[b] - counts[a] || parseInt(b, 10) - parseInt(a, 10));
    return parseInt(years[0], 10);
  }

  function populateSlamLogSeasonSelect() {
    const select = document.getElementById("edit-player-slamlog-season");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = "";
    seasons.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.year;
      opt.textContent = s.label || String(s.year);
      select.appendChild(opt);
    });
    const best = bestSeasonForPlayer(selectedEditPlayerId);
    if (previous && seasons.some((s) => String(s.year) === previous)) {
      select.value = previous;
    } else if (best && seasons.some((s) => parseInt(s.year, 10) === best)) {
      select.value = String(best);
    } else {
      const current = seasons.find((s) => s.available !== false) || seasons[seasons.length - 1];
      if (current) select.value = current.year;
    }
  }

  function populateBulkSlamClubSelect(player) {
    const select = document.getElementById("bulk-slam-club");
    if (!select) return;
    const preferred = (player?.clubIds || [])[0] || "";
    select.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— player's default —";
    select.appendChild(blank);
    clubs.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === preferred) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function renderPlayerSlamLog() {
    const wrap = document.getElementById("edit-player-slamlog");
    if (!wrap) return;
    if (!selectedEditPlayerId) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    populateSlamLogSeasonSelect();
    const player = players.find((p) => p.id === selectedEditPlayerId);
    populateBulkSlamClubSelect(player);

    const season = currentSlamLogSeason();
    const rows = playerSeasonSlams(selectedEditPlayerId, season)
      .slice()
      .sort((a, b) => b.id.localeCompare(a.id));

    const whiteCount = rows.filter((s) => s.type === "white").length;
    const blackCount = rows.filter((s) => s.type === "black").length;
    document.getElementById("edit-player-slamlog-white").textContent = String(whiteCount);
    document.getElementById("edit-player-slamlog-black").textContent = String(blackCount);
    document.getElementById("edit-player-slamlog-total").textContent = String(rows.length);
    const legend = document.getElementById("edit-player-slamlog-legend");
    if (legend) legend.textContent = rows.length ? `(${rows.length} rows)` : "";

    const tbody = document.getElementById("edit-player-slamlog-tbody");
    const empty = document.getElementById("edit-player-slamlog-empty");
    tbody.innerHTML = "";
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    rows.forEach((slam) => {
      const tr = document.createElement("tr");
      tr.dataset.slamId = slam.id;
      const clubName = slam.clubId ? clubLabel(slam.clubId) : "—";
      const hasDetail = slamHasDetail(slam);
      tr.innerHTML =
        '<td class="admin-slamlog-id">' + slam.id + '</td>' +
        '<td><span class="badge badge-' + slam.type + '">' + slam.type + '</span></td>' +
        '<td>' + (slam.source || "—") + '</td>' +
        '<td>' + clubName + '</td>' +
        '<td>' + (slam.date || "—") + '</td>' +
        '<td>' + (hasDetail
          ? '<span class="admin-slamlog-detail" title="Has date/video/match detail">★</span>'
          : '<span class="text-muted">—</span>') + '</td>' +
        '<td><button type="button" class="btn-admin btn-secondary btn-small admin-slamlog-delete" data-slam-id="' + slam.id + '" data-detail="' + (hasDetail ? '1' : '0') + '">Delete</button></td>';
      tbody.appendChild(tr);
    });
  }

  function wireSlamLogControls() {
    const seasonSelect = document.getElementById("edit-player-slamlog-season");
    if (seasonSelect) {
      seasonSelect.addEventListener("change", () => renderPlayerSlamLog());
    }
    const tbody = document.getElementById("edit-player-slamlog-tbody");
    if (tbody) {
      tbody.addEventListener("click", handleSlamLogDeleteClick);
    }
  }

  async function handleSlamLogDeleteClick(event) {
    const btn = event.target.closest(".admin-slamlog-delete");
    if (!btn) return;
    const slamId = btn.dataset.slamId;
    const hasDetail = btn.dataset.detail === "1";
    if (hasDetail) {
      const proceed = window.confirm(
        "Slam " + slamId + " has a date, video, or match reference. Delete anyway?"
      );
      if (!proceed) return;
    }
    const token = getStoredToken();
    if (!token) {
      show(loginEl);
      return;
    }
    setStatus("Submitting delete for " + slamId + "…", "pending");
    btn.disabled = true;
    try {
      const issue = await createIssue(token, {
        title: "[Edit slam] " + slamId + " — delete",
        labels: ["edit-slam"],
        body: issueBody({
          "Slam ID": slamId,
          Action: "delete",
        }),
      });
      setStatus("Issue #" + issue.number + " created — slam will be deleted after validation.", "success");
    } catch (err) {
      setStatus(err.message, "error");
      btn.disabled = false;
    }
  }

  function renderEditPlayerPicker() {
    const picker = document.getElementById("edit-player-picker");
    const hint = document.getElementById("edit-player-filter-hint");
    if (!picker) return;

    const filtered = filterEditPlayers();
    picker.innerHTML = "";

    if (!filtered.length) {
      picker.innerHTML = '<p class="entity-picker-empty">No players match this search.</p>';
      if (hint) hint.textContent = `0 of ${players.length} players`;
      if (selectedEditPlayerId && !filtered.some((p) => p.id === selectedEditPlayerId)) {
        clearEditPlayerSelection();
      }
      return;
    }

    if (hint) {
      hint.textContent =
        filtered.length === players.length
          ? `${players.length} players — search by name, alias, or ID`
          : `Showing ${filtered.length} of ${players.length} players`;
    }

    if (selectedEditPlayerId && !filtered.some((p) => p.id === selectedEditPlayerId)) {
      clearEditPlayerSelection();
    }

    filtered.forEach((player) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `entity-picker-item${player.id === selectedEditPlayerId ? " is-selected" : ""}`;
      btn.dataset.playerId = player.id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", player.id === selectedEditPlayerId ? "true" : "false");

      const badge = document.createElement("span");
      badge.className = "entity-picker-badge";
      badge.textContent = player.gender === "female" ? "F" : "M";

      const main = document.createElement("span");
      main.className = "entity-picker-main";

      const name = document.createElement("span");
      name.className = "entity-picker-title";
      name.textContent = player.name;

      const meta = document.createElement("span");
      meta.className = "entity-picker-meta";
      meta.textContent = playerMetaLine(player);

      main.appendChild(name);
      main.appendChild(meta);

      const id = document.createElement("span");
      id.className = "entity-picker-id";
      id.textContent = player.id;

      btn.appendChild(badge);
      btn.appendChild(main);
      btn.appendChild(id);
      btn.addEventListener("click", () => selectEditPlayer(player.id));
      picker.appendChild(btn);
    });
  }

  function updateEditPlayerActionState() {
    const action = document.getElementById("edit-player-action");
    const fields = document.getElementById("edit-player-fields");
    const preview = document.getElementById("edit-player-preview");
    const warning = document.getElementById("edit-player-deactivate-warning");
    const isDeactivate = action?.value === "deactivate";
    if (fields) fields.hidden = isDeactivate;
    if (preview) preview.classList.toggle("is-delete", isDeactivate);
    if (warning) warning.hidden = !isDeactivate;
  }

  function setupEditPlayerPicker() {
    document.getElementById("edit-player-search")?.addEventListener("input", renderEditPlayerPicker);
    document.getElementById("edit-player-action")?.addEventListener("change", updateEditPlayerActionState);
  }

  function resetEditPlayerForm() {
    const form = document.getElementById("admin-edit-player-form");
    if (!form) return;
    form.reset();
    clearEditPlayerSelection();
    const search = document.getElementById("edit-player-search");
    if (search) search.value = "";
    renderEditPlayerPicker();
    updateEditPlayerActionState();
    populateEditPlayerClubSelect("");
    renderPlayerSlamLog();
  }

  function playerLabel(playerId) {
    return players.find((p) => p.id === playerId)?.name || playerId;
  }

  function clubLabel(clubId) {
    if (!clubId) return "";
    return clubs.find((c) => c.id === clubId)?.name || clubId;
  }

  function slamMetaLine(slam) {
    const parts = [slam.source];
    if (slam.clubId) parts.push(clubLabel(slam.clubId));
    if (slam.tournament) parts.push(slam.tournament);
    if (slam.location) parts.push(slam.location);
    if (slam.date) parts.push(slam.date);
    return parts.filter(Boolean).join(" · ");
  }

  function sortedSlams(list) {
    return [...list].sort((a, b) => {
      const byPlayer = playerLabel(a.playerId).localeCompare(playerLabel(b.playerId), undefined, {
        sensitivity: "base",
      });
      if (byPlayer !== 0) return byPlayer;
      if (a.type !== b.type) return a.type === "white" ? -1 : 1;
      return b.id.localeCompare(a.id);
    });
  }

  function filterEditSlams() {
    const playerId = document.getElementById("edit-filter-player")?.value || "";
    const type = document.getElementById("edit-filter-type")?.value || "";
    const query = (document.getElementById("edit-filter-search")?.value || "").trim().toLowerCase();

    return slams.filter((slam) => {
      if (playerId && slam.playerId !== playerId) return false;
      if (type && slam.type !== type) return false;
      if (!query) return true;
      const haystack = [
        slam.id,
        slam.playerId,
        playerLabel(slam.playerId),
        slam.type,
        slam.source,
        slam.clubId,
        clubLabel(slam.clubId),
        slam.tournament,
        slam.location,
        slam.date,
        slam.matchRef,
        slam.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderEditSlamPreview(slam) {
    const preview = document.getElementById("edit-slam-preview");
    const badge = document.getElementById("edit-preview-badge");
    const title = document.getElementById("edit-preview-title");
    const idEl = document.getElementById("edit-preview-id");
    const details = document.getElementById("edit-slam-details");
    if (!preview || !slam) return;

    preview.hidden = false;
    if (badge) {
      badge.textContent = slam.type;
      badge.className = `slam-picker-badge slam-picker-badge-${slam.type}`;
    }
    if (title) title.textContent = playerLabel(slam.playerId);
    if (idEl) idEl.textContent = slam.id;

    if (details) {
      details.innerHTML = "";
      const rows = [
        ["Player", playerLabel(slam.playerId)],
        ["Type", slam.type],
        ["Source", slam.source],
        ["Club", slam.clubId ? clubLabel(slam.clubId) : "—"],
        ["Date", slam.date || "—"],
        ["Location", slam.location || "—"],
        ["Tournament", slam.tournament || "—"],
        ["Match ref", slam.matchRef || "—"],
        ["Notes", slam.notes || "—"],
      ];
      rows.forEach(([label, value]) => {
        const wrap = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        wrap.appendChild(dt);
        wrap.appendChild(dd);
        details.appendChild(wrap);
      });
    }

    updateEditActionState();
  }

  function clearEditSlamSelection() {
    selectedEditSlamId = "";
    const hidden = document.getElementById("edit-slam-id");
    if (hidden) hidden.value = "";
    const preview = document.getElementById("edit-slam-preview");
    if (preview) preview.hidden = true;
  }

  function selectEditSlam(slamId) {
    const slam = slams.find((s) => s.id === slamId);
    if (!slam) return;
    selectedEditSlamId = slamId;
    const hidden = document.getElementById("edit-slam-id");
    if (hidden) hidden.value = slamId;
    renderEditSlamPicker();
    renderEditSlamPreview(slam);
  }

  function renderEditSlamPicker() {
    const picker = document.getElementById("edit-slam-picker");
    const hint = document.getElementById("edit-slam-filter-hint");
    if (!picker) return;

    const filtered = sortedSlams(filterEditSlams());
    picker.innerHTML = "";

    if (!filtered.length) {
      picker.innerHTML = '<p class="slam-picker-empty">No slams match these filters.</p>';
      if (hint) hint.textContent = `0 of ${slams.length} slams`;
      if (selectedEditSlamId && !filtered.some((s) => s.id === selectedEditSlamId)) {
        clearEditSlamSelection();
      }
      return;
    }

    if (hint) {
      hint.textContent =
        filtered.length === slams.length
          ? `${slams.length} slams — filter by player, type, or search`
          : `Showing ${filtered.length} of ${slams.length} slams`;
    }

    if (selectedEditSlamId && !filtered.some((s) => s.id === selectedEditSlamId)) {
      clearEditSlamSelection();
    }

    filtered.forEach((slam) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slam-picker-item${slam.id === selectedEditSlamId ? " is-selected" : ""}`;
      btn.dataset.slamId = slam.id;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", slam.id === selectedEditSlamId ? "true" : "false");

      const badge = document.createElement("span");
      badge.className = `slam-picker-badge slam-picker-badge-${slam.type}`;
      badge.textContent = slam.type;

      const main = document.createElement("span");
      main.className = "slam-picker-main";

      const player = document.createElement("span");
      player.className = "slam-picker-player";
      player.textContent = playerLabel(slam.playerId);

      const meta = document.createElement("span");
      meta.className = "slam-picker-meta";
      meta.textContent = slamMetaLine(slam) || "No extra details";

      main.appendChild(player);
      main.appendChild(meta);

      const id = document.createElement("span");
      id.className = "slam-picker-id";
      id.textContent = slam.id;

      btn.appendChild(badge);
      btn.appendChild(main);
      btn.appendChild(id);
      btn.addEventListener("click", () => selectEditSlam(slam.id));
      picker.appendChild(btn);
    });
  }

  function populateEditFilters() {
    const playerSelect = document.getElementById("edit-filter-player");
    if (playerSelect) {
      playerSelect.innerHTML = '<option value="">All players</option>';
      players.forEach((player) => {
        const opt = document.createElement("option");
        opt.value = player.id;
        opt.textContent = player.name;
        playerSelect.appendChild(opt);
      });
      playerSelect.value = "";
    }
    enhanceSearchableSelect(playerSelect);
    const typeSelect = document.getElementById("edit-filter-type");
    if (typeSelect) typeSelect.value = "";
    const search = document.getElementById("edit-filter-search");
    if (search) search.value = "";
    renderEditSlamPicker();
  }

  function updateEditActionState() {
    const action = document.getElementById("edit-action");
    const fields = document.getElementById("edit-fields");
    const preview = document.getElementById("edit-slam-preview");
    const warning = document.getElementById("edit-delete-warning");
    const isDelete = action?.value === "delete";
    if (fields) fields.hidden = isDelete;
    if (preview) preview.classList.toggle("is-delete", isDelete);
    if (warning) warning.hidden = !isDelete;
  }

  function setupEditSlamPicker() {
    ["edit-filter-player", "edit-filter-type"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", renderEditSlamPicker);
    });
    document.getElementById("edit-filter-search")?.addEventListener("input", renderEditSlamPicker);
  }

  function resetEditForm() {
    const form = document.getElementById("admin-edit-form");
    if (!form) return;
    form.reset();
    clearEditSlamSelection();
    renderEditSlamPicker();
    updateEditActionState();
  }

  function getSelectedClubIds(form) {
    const select = form.clubIds;
    if (!select) return [];
    return [...select.selectedOptions].map((opt) => opt.value).filter(Boolean);
  }

  async function loadCatalog() {
    const [playersData, clubsData, slamsData, seasonsData] = await Promise.all([
      fetchJson(config.playersUrl),
      fetchJson(config.clubsUrl),
      fetchJson(config.slamsUrl),
      fetchJson(config.seasonsUrl).catch(() => ({ seasons: [] })),
    ]);
    players = playersData.players || [];
    clubs = clubsData.clubs || [];
    slams = (slamsData.slams || []).filter((s) => s.active !== false);
    seasons = (seasonsData.seasons || []).slice().sort((a, b) => a.year - b.year);

    populateSelect(
      document.getElementById("slam-player"),
      players.map((p) => ({ id: p.id, name: formatPlayerOption(p) })),
      { blank: true },
    );
    enhanceSearchableSelect(document.getElementById("slam-player"));
    populatePlayerClubSelect();
    refreshSlamClubOptions();
    populateEditFilters();
    renderEditPlayerPicker();
    populateEditPlayerClubSelect("");
    populateEditClubPicker();
    populateSeasonList();
    populateEditSeasonSelect();
    enhanceAllSelects();
    updateCatalogStats();
  }

  function populateEditClubPicker() {
    const select = document.getElementById("edit-club-picker");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Select…</option>';
    clubs.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.active === false ? `${c.name} (inactive)` : c.name;
      select.appendChild(opt);
    });
    if (previous && clubs.some((c) => c.id === previous)) select.value = previous;
  }

  function fillEditClubForm(clubId) {
    const club = clubs.find((c) => c.id === clubId);
    const nameEl = document.getElementById("edit-club-name");
    const contactEl = document.getElementById("edit-club-contact");
    const notesEl = document.getElementById("edit-club-notes");
    if (!club) {
      if (nameEl) nameEl.value = "";
      if (contactEl) contactEl.value = "";
      if (notesEl) notesEl.value = "";
      return;
    }
    if (nameEl) nameEl.value = club.name || "";
    if (contactEl) contactEl.value = club.contact || "";
    if (notesEl) notesEl.value = club.notes || "";
  }

  function updateEditClubActionState() {
    const action = document.getElementById("edit-club-action");
    const fields = document.getElementById("edit-club-fields");
    const warning = document.getElementById("edit-club-deactivate-warning");
    const isDeactivate = action?.value === "deactivate";
    if (fields) fields.hidden = isDeactivate;
    if (warning) warning.hidden = !isDeactivate;
  }

  function setupEditClubForm() {
    document.getElementById("edit-club-picker")?.addEventListener("change", (event) => {
      fillEditClubForm(event.target.value);
    });
    document.getElementById("edit-club-action")?.addEventListener("change", updateEditClubActionState);
    updateEditClubActionState();
  }

  function populateSeasonList() {
    const list = document.getElementById("admin-season-list");
    if (!list) return;
    list.innerHTML = "";
    if (!seasons.length) {
      const li = document.createElement("li");
      li.textContent = "No seasons defined yet.";
      list.appendChild(li);
      return;
    }
    seasons.forEach((s) => {
      const li = document.createElement("li");
      const status = s.available === false ? " (hidden)" : "";
      li.textContent = `${s.label || s.year} — ${s.start} → ${s.end}${status}`;
      list.appendChild(li);
    });
  }

  function populateEditSeasonSelect() {
    const select = document.getElementById("edit-season-year");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Select…</option>';
    seasons.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.year;
      opt.textContent = `${s.label || s.year} (${s.start} → ${s.end})`;
      select.appendChild(opt);
    });
    if (previous) select.value = previous;
  }

  function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((t) => {
          t.classList.remove("is-active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        const name = tab.dataset.tab;
        ["player", "edit-player", "club", "edit-club", "slam", "edit", "season"].forEach((panel) => {
          const el = document.getElementById(`panel-${panel}`);
          if (el) el.hidden = panel !== name;
        });
        setStatus("");
      });
    });
  }

  function setupSlugPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;
    input.addEventListener("input", () => {
      preview.textContent = input.value.trim() ? slugify(input.value) : "—";
    });
  }

  function setupSourceToggle() {
    const source = document.getElementById("slam-source");
    const clubField = document.getElementById("slam-club-field");
    const clubSelect = document.getElementById("slam-club");
    function update() {
      const isClub = source?.value === "club";
      if (clubField) clubField.hidden = !isClub;
      if (clubSelect) clubSelect.required = isClub;
      if (isClub) refreshSlamClubOptions({ preserveSelection: true });
    }
    source?.addEventListener("change", update);
    update();
  }

  function setupSlamPlayerClubLink() {
    document.getElementById("slam-player")?.addEventListener("change", () => {
      refreshSlamClubOptions();
    });
  }

  function setupEditToggle() {
    document.getElementById("edit-action")?.addEventListener("change", updateEditActionState);
  }

  async function bootstrapSession(token) {
    const user = await fetchGitHubUser(token);
    if (!(await isAllowedUser(user.login))) {
      setStoredToken(null);
      show(deniedEl);
      return;
    }
    setStoredToken(token);
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    document.getElementById("admin-user-label").textContent = `Signed in as @${user.login}`;
    try {
      await loadCatalog();
      show(appEl);
    } catch (err) {
      setStoredToken(null);
      show(loginEl);
      if (loginError) {
        loginError.textContent = err.message || "Could not load admin data.";
        loginError.hidden = false;
      }
    }
  }

  function signOut() {
    setStoredToken(null);
    show(loginEl);
  }

  document.getElementById("admin-token-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = event.target.token.value.trim();
    const signInBtn = document.getElementById("admin-signin-btn");
    if (loginError) loginError.hidden = true;
    setButtonLoading(signInBtn, true, "Signing in…");
    try {
      await bootstrapSession(token);
      event.target.reset();
    } catch (err) {
      if (loginError) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      }
    } finally {
      setButtonLoading(signInBtn, false);
    }
  });

  document.getElementById("admin-token")?.addEventListener("input", () => {
    if (loginError) loginError.hidden = true;
  });

  document.getElementById("admin-logout-btn")?.addEventListener("click", signOut);
  document.getElementById("admin-logout-denied")?.addEventListener("click", signOut);

  document.getElementById("admin-player-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const name = form.name.value.trim();
    const gender = form.gender.value.trim();
    if (!name || !gender) {
      setStatus("Name and gender are required.", "error");
      return;
    }

    const clubIds = getSelectedClubIds(form).join(", ");
    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const issue = await createIssue(token, {
        title: `[Player] ${name}`,
        labels: ["add-player"],
        body: issueBody({
          "Full name": name,
          Gender: gender,
          District: "Thane",
          "Club IDs (comma-separated)": clubIds,
          "Aliases (optional)": form.aliases.value.trim(),
        }),
      });
      setStatus(`Issue #${issue.number} created — player will update after validation.`, "success");
      form.reset();
      document.getElementById("player-slug-preview").textContent = "—";
      populatePlayerClubSelect();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-club-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const name = form.name.value.trim();
    if (!name) {
      setStatus("Club name is required.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const issue = await createIssue(token, {
        title: `[Club] ${name}`,
        labels: ["add-club"],
        body: issueBody({
          "Club name": name,
          District: "Thane",
          "Contact (optional)": form.contact.value.trim(),
          "Notes (optional)": form.notes.value.trim(),
        }),
      });
      setStatus(`Issue #${issue.number} created — club will update after validation.`, "success");
      form.reset();
      document.getElementById("club-slug-preview").textContent = "—";
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-slam-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const playerId = form.playerId.value;
    const source = form.source.value;
    if (!playerId) {
      setStatus("Player is required.", "error");
      return;
    }
    if (source === "club" && !form.clubId.value) {
      setStatus("Club is required when source is club.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const player = players.find((p) => p.id === playerId);
      const issue = await createIssue(token, {
        title: `[Slam] ${player?.name || playerId} — ${form.type.value}`,
        labels: ["add-slam"],
        body: issueBody({
          "Player ID": playerId,
          "Slam type": form.type.value,
          Source: source,
          Season: form.season.value,
          "Club ID": source === "club" ? form.clubId.value : "",
          "Date (YYYY-MM-DD)": form.date.value,
          "Tournament (optional)": form.tournament.value.trim(),
          "Location (optional)": form.location.value.trim(),
          "Video URL (optional)": form.videoUrl.value.trim(),
          "Match ref (optional)": form.matchRef.value.trim(),
          "Notes (optional)": form.notes.value.trim(),
        }),
      });
      setStatus(`Issue #${issue.number} created — slam will be added after validation.`, "success");
      form.reset();
      setupSourceToggle();
      refreshSlamClubOptions();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const slamId = form.slamId.value;
    if (!slamId) {
      setStatus("Select a slam from the list above.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const issue = await createIssue(token, {
        title: `[Edit slam] ${slamId}`,
        labels: ["edit-slam"],
        body: issueBody({
          "Slam ID": slamId,
          Action: form.action.value,
          "Slam type": form.type.value,
          Source: form.source.value,
          "Date (YYYY-MM-DD)": form.date.value,
          "Notes (optional)": form.notes.value.trim(),
        }),
      });
      setStatus(`Issue #${issue.number} created — edit will apply after validation.`, "success");
      resetEditForm();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-edit-player-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const playerId = form.playerId.value;
    const action = form.action.value;
    if (!playerId) {
      setStatus("Select a player from the list above.", "error");
      return;
    }

    const player = players.find((p) => p.id === playerId);
    if (action === "update") {
      const name = form.name.value.trim();
      const gender = form.gender.value.trim();
      if (!name || !gender) {
        setStatus("Name and gender are required for profile updates.", "error");
        return;
      }
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const clubIds = getSelectedClubIds(form).join(", ");
      const fields =
        action === "deactivate"
          ? {
              "Player ID": playerId,
              Action: "deactivate",
            }
          : {
              "Player ID": playerId,
              Action: "update",
              "Full name": form.name.value.trim(),
              Gender: form.gender.value.trim(),
              "Aliases (optional)": form.aliases.value.trim(),
              "Club IDs (comma-separated)": clubIds,
            };
      const issue = await createIssue(token, {
        title: `[Edit player] ${player?.name || playerId}`,
        labels: ["edit-player"],
        body: issueBody(fields, {
          always: action === "update" ? ["Club IDs (comma-separated)", "Aliases (optional)"] : [],
        }),
      });
      setStatus(`Issue #${issue.number} created — player edit will apply after validation.`, "success");
      resetEditPlayerForm();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-bulk-slam-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    if (!selectedEditPlayerId) {
      setStatus("Select a player first.", "error");
      return;
    }

    const form = event.target;
    const type = form.type.value;
    const count = parseInt(form.count.value, 10);
    const source = form.source.value || "club";
    const clubId = form.clubId.value || "";
    const season = currentSlamLogSeason();

    if (!count || count <= 0) {
      setStatus("Count must be greater than zero.", "error");
      return;
    }
    if (count > 100) {
      setStatus("Count exceeds bulk limit of 100.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const player = players.find((p) => p.id === selectedEditPlayerId);
      const issue = await createIssue(token, {
        title: `[Bulk slam] ${player?.name || selectedEditPlayerId} — +${count} ${type}`,
        labels: ["bulk-add-slam"],
        body: issueBody({
          "Player id": selectedEditPlayerId,
          Season: String(season),
          Type: type,
          Count: String(count),
          Source: source,
          "Club id": clubId,
        }),
      });
      setStatus(`Issue #${issue.number} created — ${count} ${type} slam(s) will be added after validation.`, "success");
      form.count.value = "1";
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-edit-club-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const clubId = form.clubId.value;
    if (!clubId) {
      setStatus("Select a club to edit.", "error");
      return;
    }
    const action = form.action.value || "update";

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const club = clubs.find((c) => c.id === clubId);
      const fields = action === "deactivate"
        ? { "Club id": clubId, Action: "deactivate" }
        : {
            "Club id": clubId,
            Action: "update",
            "Name (optional)": form.name.value.trim(),
            "Contact (optional)": form.contact.value.trim(),
            "Notes (optional)": form.notes.value.trim(),
          };
      const issue = await createIssue(token, {
        title: `[Edit club] ${club?.name || clubId}`,
        labels: ["edit-club"],
        body: issueBody(fields, {
          always: action === "update" ? ["Contact (optional)", "Notes (optional)"] : [],
        }),
      });
      setStatus(`Issue #${issue.number} created — club will update after validation.`, "success");
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-season-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const year = form.year.value.trim();
    const start = form.start.value;
    const end = form.end.value;
    const label = form.label.value.trim();

    if (!year || !start || !end) {
      setStatus("Start year, start date, and end date are required.", "error");
      return;
    }
    if (end <= start) {
      setStatus("End date must be after start date.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const issue = await createIssue(token, {
        title: `[Season] ${label || year}`,
        labels: ["add-season"],
        body: issueBody({
          "Start year": year,
          "Start date": start,
          "End date": end,
          Label: label,
        }),
      });
      setStatus(`Issue #${issue.number} created — season will be added after validation.`, "success");
      form.reset();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  document.getElementById("admin-edit-season-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const year = form.year.value.trim();
    if (!year) {
      setStatus("Select a season to edit.", "error");
      return;
    }

    const start = form.start.value;
    const end = form.end.value;
    if (start && end && end <= start) {
      setStatus("End date must be after start date.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
    const submitBtn = form.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Submitting…");
    try {
      const issue = await createIssue(token, {
        title: `[Edit season] ${year}`,
        labels: ["edit-season"],
        body: issueBody({
          Season: year,
          Label: form.label.value.trim(),
          "Start date": start,
          "End date": end,
          Available: form.available.value,
        }),
      });
      setStatus(`Issue #${issue.number} created — season edit will apply after validation.`, "success");
      form.reset();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  setupTabs();
  setupSlugPreview("player-name", "player-slug-preview");
  setupSlugPreview("club-name", "club-slug-preview");
  setupSourceToggle();
  setupSlamPlayerClubLink();
  setupEditSlamPicker();
  setupEditPlayerPicker();
  setupEditToggle();
  wireSlamLogControls();
  setupEditClubForm();
  setupMultiSelectFilter("player-clubs", "player-clubs-search");
  setupMultiSelectFilter("edit-player-clubs", "edit-player-clubs-search");
  enhanceAllSelects();

  const token = getStoredToken();
  if (token) {
    bootstrapSession(token).catch(() => show(loginEl));
  } else {
    show(loginEl);
  }
})();

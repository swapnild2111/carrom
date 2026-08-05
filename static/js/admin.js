(function () {
  "use strict";

  const config = window.CARROM_ADMIN || {};
  const TOKEN_KEY = "carrom_admin_token";
  const USER_KEY = "carrom_admin_user";
  const RECENT_KEY = "carrom_admin_recent";
  const RECENT_MAX = 25;

  const loginEl = document.getElementById("admin-login");
  const deniedEl = document.getElementById("admin-denied");
  const appEl = document.getElementById("admin-app");
  const statusEl = document.getElementById("admin-form-status");
  const loginError = document.getElementById("admin-login-error");
  const drawerEl = document.getElementById("admin-drawer");
  const drawerBackdrop = document.getElementById("admin-drawer-backdrop");
  const settingsModal = document.getElementById("admin-settings-modal");

  let players = [];
  let clubs = [];
  let slams = [];
  let seasons = [];
  let currentSeasonYear = null;
  let activeSeasonYear = null;
  let selectedPlayerId = null;

  function hideAll() {
    [loginEl, deniedEl, appEl].forEach((el) => { if (el) el.hidden = true; });
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
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
    button.disabled = loading;
    button.textContent = loading ? loadingText : button.dataset.defaultLabel;
  }

  function getStoredToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function setStoredToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  }

  function getRecent() {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function pushRecent(entry) {
    const items = getRecent();
    items.unshift({ ...entry, at: new Date().toISOString() });
    while (items.length > RECENT_MAX) items.pop();
    try { sessionStorage.setItem(RECENT_KEY, JSON.stringify(items)); } catch { /* ignore */ }
    if (selectedPlayerId && entry.playerId === selectedPlayerId) renderDrawerActivity();
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
    if (!res.ok) throw new Error(data.message || "Could not create GitHub issue");
    return data;
  }

  function issueBody(fields) {
    return Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `### ${k}\n\n${v}`)
      .join("\n\n");
  }

  function clubName(clubId) {
    if (!clubId) return "—";
    const c = clubs.find((cc) => cc.id === clubId);
    return c ? c.name : clubId;
  }

  function playerClubNames(player) {
    return (player.clubIds || []).map(clubName).filter(Boolean).join(", ");
  }

  function slamsForPlayerSeason(playerId, year) {
    return slams.filter((s) =>
      s.playerId === playerId &&
      parseInt(s.season, 10) === parseInt(year, 10) &&
      s.active !== false
    );
  }

  function countByType(rowsList) {
    let w = 0, b = 0;
    rowsList.forEach((s) => { if (s.type === "white") w++; else if (s.type === "black") b++; });
    return { white: w, black: b, total: w + b };
  }

  function bestSeasonForPlayer(playerId) {
    const counts = {};
    slams.forEach((s) => {
      if (s.playerId !== playerId || s.active === false) return;
      const y = parseInt(s.season, 10);
      counts[y] = (counts[y] || 0) + 1;
    });
    const years = Object.keys(counts);
    if (!years.length) return null;
    years.sort((a, b) => counts[b] - counts[a] || parseInt(b, 10) - parseInt(a, 10));
    return parseInt(years[0], 10);
  }

  function playerRowStats(playerId, year) {
    return countByType(slamsForPlayerSeason(playerId, year));
  }

  async function loadCatalog() {
    const [playersData, clubsData, slamsData, seasonsData] = await Promise.all([
      fetchJson(config.playersUrl),
      fetchJson(config.clubsUrl),
      fetchJson(config.slamsUrl),
      fetchJson(config.seasonsUrl).catch(() => ({ seasons: [] })),
    ]);
    players = (playersData.players || []).filter((p) => p.active !== false);
    clubs = clubsData.clubs || [];
    slams = slamsData.slams || [];
    seasons = (seasonsData.seasons || []).slice().sort((a, b) => a.year - b.year);
    currentSeasonYear = pickCurrentSeason();
    // Active season follows the URL's ?season=YYYY set by the site header
    // picker in baseof.html — admin doesn't duplicate the dropdown.
    const requested = new URLSearchParams(window.location.search).get("season");
    const requestedYear = requested ? parseInt(requested, 10) : NaN;
    if (Number.isFinite(requestedYear) && seasons.some((s) => parseInt(s.year, 10) === requestedYear)) {
      activeSeasonYear = requestedYear;
    } else {
      activeSeasonYear = currentSeasonYear;
    }
  }

  function pickCurrentSeason() {
    if (!seasons.length) return new Date().getFullYear();
    const today = new Date().toISOString().slice(0, 10);
    for (const s of seasons) {
      if (s.start <= today && today <= s.end) return parseInt(s.year, 10);
    }
    return parseInt(seasons[seasons.length - 1].year, 10);
  }

  function renderTopbar() {
    const badge = document.getElementById("admin-season-badge");
    if (badge) {
      const s = seasons.find((ss) => parseInt(ss.year, 10) === activeSeasonYear);
      const label = s ? (s.label || String(s.year)) : String(activeSeasonYear);
      const isCurrent = activeSeasonYear === currentSeasonYear;
      badge.textContent = isCurrent ? `${label} · current` : label;
    }
    const stats = document.getElementById("admin-catalog-stats");
    if (stats) {
      const activeSlamCount = slams.filter((s) => s.active !== false && parseInt(s.season, 10) === activeSeasonYear).length;
      stats.textContent = `${players.length} players · ${clubs.filter((c) => c.active !== false).length} clubs · ${activeSlamCount} slams this season`;
    }
  }

  function renderPlayerList() {
    const q = (document.getElementById("admin-player-search")?.value || "").trim().toLowerCase();
    const tbody = document.getElementById("admin-player-tbody");
    const empty = document.getElementById("admin-player-empty");
    const count = document.getElementById("admin-player-count");
    if (!tbody) return;
    tbody.innerHTML = "";

    let filtered = players.slice();
    if (q) {
      filtered = filtered.filter((p) => {
        const hay = [p.name, ...(p.aliases || []), p.id, playerClubNames(p)]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    filtered = filtered.map((p) => ({ ...p, _stats: playerRowStats(p.id, activeSeasonYear) }));
    filtered.sort((a, b) => b._stats.total - a._stats.total || a.name.localeCompare(b.name));

    if (!filtered.length) {
      empty.hidden = false;
      if (count) count.textContent = "";
      return;
    }
    empty.hidden = true;
    if (count) count.textContent = `${filtered.length} player${filtered.length === 1 ? "" : "s"}`;

    filtered.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.dataset.playerId = p.id;
      const s = p._stats;
      tr.innerHTML =
        `<td class="admin-list-rank">${i + 1}</td>` +
        `<td class="admin-list-player"><strong>${escapeHtml(p.name)}</strong>${p.aliases && p.aliases.length ? `<span class="admin-list-alias">${escapeHtml(p.aliases.join(", "))}</span>` : ""}</td>` +
        `<td class="admin-list-club">${escapeHtml(playerClubNames(p) || "—")}</td>` +
        `<td class="num">${s.white}</td>` +
        `<td class="num">${s.black}</td>` +
        `<td class="num"><strong>${s.total}</strong></td>` +
        `<td class="admin-list-open"><button type="button" class="btn-admin btn-icon btn-small" data-open-player="${p.id}" aria-label="Open ${escapeHtml(p.name)}">›</button></td>`;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function openDrawer(playerId) {
    selectedPlayerId = playerId;
    const p = players.find((pp) => pp.id === playerId);
    if (!p) return;

    document.getElementById("drawer-title").textContent = p.name;
    document.getElementById("drawer-player-id").textContent = p.id;
    const avatarEl = document.getElementById("drawer-avatar");
    if (avatarEl) {
      const bits = p.name.trim().split(/\s+/);
      const initials = ((bits[0]?.[0] || "?") + (bits[bits.length - 1]?.[0] || "")).toUpperCase();
      avatarEl.textContent = initials;
      avatarEl.dataset.gender = (p.gender || "male").toLowerCase();
    }
    document.getElementById("drawer-name").value = p.name || "";
    const genderEl = document.getElementById("drawer-gender");
    if (genderEl) genderEl.value = p.gender ? (p.gender.charAt(0).toUpperCase() + p.gender.slice(1)) : "Male";
    document.getElementById("drawer-aliases").value = (p.aliases || []).join(", ");

    renderDrawerClubChips(p);

    const drawerSeason = bestSeasonForPlayer(p.id) || activeSeasonYear;
    updateDrawerSlamCounts(p.id, drawerSeason);
    renderDrawerActivity();

    drawerEl.hidden = false;
    drawerEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("has-drawer");
  }

  function closeDrawer(force) {
    if (!force && drawerHasUnsavedChanges()) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
      discardDrawerPending();
    }
    selectedPlayerId = null;
    drawerPending = null;
    updateSaveBadge();
    drawerEl.hidden = true;
    drawerEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-drawer");
  }

  // Multi-select combobox for drawer club field.
  // Selection state lives on the combobox root as data-selected="id1,id2".
  function renderDrawerClubChips(player) {
    const combo = document.getElementById("drawer-clubs");
    if (!combo) return;
    combo.dataset.selected = (player.clubIds || []).join(",");
    const search = document.getElementById("drawer-club-search");
    if (search) search.value = "";
    renderClubTags();
    renderClubDropdown("");
    closeClubDropdown();
  }

  function readDrawerClubChips() {
    const combo = document.getElementById("drawer-clubs");
    if (!combo) return [];
    return (combo.dataset.selected || "").split(",").map((s) => s.trim()).filter(Boolean);
  }

  function getSelectedClubSet() {
    return new Set(readDrawerClubChips());
  }

  function setSelectedClubs(ids) {
    const combo = document.getElementById("drawer-clubs");
    if (!combo) return;
    combo.dataset.selected = ids.join(",");
  }

  function toggleClubSelection(id) {
    const set = getSelectedClubSet();
    if (set.has(id)) set.delete(id); else set.add(id);
    setSelectedClubs([...set]);
    renderClubTags();
    renderClubDropdown(document.getElementById("drawer-club-search")?.value || "");
  }

  function renderClubTags() {
    const tags = document.getElementById("drawer-club-tags");
    if (!tags) return;
    tags.innerHTML = "";
    const set = getSelectedClubSet();
    clubs.filter((c) => set.has(c.id)).forEach((c) => {
      const tag = document.createElement("span");
      tag.className = "ms-tag";
      tag.dataset.clubId = c.id;
      tag.innerHTML = `<span class="ms-tag-label">${escapeHtml(c.name)}</span><button type="button" class="ms-tag-x" aria-label="Remove ${escapeHtml(c.name)}">×</button>`;
      tags.appendChild(tag);
    });
  }

  function renderClubDropdown(query) {
    const dropdown = document.getElementById("drawer-club-dropdown");
    if (!dropdown) return;
    const q = (query || "").trim().toLowerCase();
    const set = getSelectedClubSet();
    const active = clubs.filter((c) => c.active !== false && (!q || c.name.toLowerCase().includes(q)));
    dropdown.innerHTML = "";
    if (!active.length) {
      const empty = document.createElement("div");
      empty.className = "ms-empty";
      empty.textContent = q ? "No clubs match." : "No clubs available — add one via Manage.";
      dropdown.appendChild(empty);
      return;
    }
    active.forEach((c) => {
      const row = document.createElement("div");
      const on = set.has(c.id);
      row.className = "ms-row" + (on ? " ms-row-on" : "");
      row.dataset.clubId = c.id;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", on ? "true" : "false");
      row.innerHTML =
        `<span class="ms-check" aria-hidden="true">${on ? "✓" : ""}</span>` +
        `<span class="ms-row-name">${escapeHtml(c.name)}</span>`;
      dropdown.appendChild(row);
    });
  }

  function openClubDropdown() {
    const dropdown = document.getElementById("drawer-club-dropdown");
    const control = document.querySelector("#drawer-clubs .ms-combo-control");
    if (!dropdown || !control) return;
    dropdown.hidden = false;
    control.setAttribute("aria-expanded", "true");
    document.getElementById("drawer-clubs").classList.add("ms-open");
  }

  function closeClubDropdown() {
    const dropdown = document.getElementById("drawer-club-dropdown");
    const control = document.querySelector("#drawer-clubs .ms-combo-control");
    if (!dropdown || !control) return;
    dropdown.hidden = true;
    control.setAttribute("aria-expanded", "false");
    document.getElementById("drawer-clubs").classList.remove("ms-open");
  }

  function wireDrawerClubCombobox() {
    const combo = document.getElementById("drawer-clubs");
    if (!combo || combo.dataset.wired === "1") return;
    combo.dataset.wired = "1";
    const control = combo.querySelector(".ms-combo-control");
    const search = combo.querySelector("#drawer-club-search");
    const dropdown = combo.querySelector("#drawer-club-dropdown");
    const tags = combo.querySelector("#drawer-club-tags");

    control.addEventListener("click", (e) => {
      if (e.target.closest(".ms-tag-x")) return;
      openClubDropdown();
      search.focus();
    });
    search.addEventListener("focus", openClubDropdown);
    search.addEventListener("input", () => renderClubDropdown(search.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeClubDropdown(); search.blur(); }
      if (e.key === "Backspace" && !search.value) {
        const ids = readDrawerClubChips();
        if (ids.length) toggleClubSelection(ids[ids.length - 1]);
      }
    });

    dropdown.addEventListener("mousedown", (e) => {
      const row = e.target.closest(".ms-row");
      if (!row) return;
      e.preventDefault();
      toggleClubSelection(row.dataset.clubId);
      search.focus();
    });

    tags.addEventListener("click", (e) => {
      const x = e.target.closest(".ms-tag-x");
      if (!x) return;
      const tag = x.closest(".ms-tag");
      if (tag) toggleClubSelection(tag.dataset.clubId);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#drawer-clubs")) closeClubDropdown();
    });
  }

  function updateDrawerSlamCounts(playerId, year) {
    const s = playerRowStats(playerId, year);
    document.getElementById("drawer-white-count").textContent = s.white;
    document.getElementById("drawer-black-count").textContent = s.black;
    const labelEl = document.getElementById("drawer-slam-season-label");
    const season = seasons.find((ss) => parseInt(ss.year, 10) === parseInt(year, 10));
    if (labelEl) labelEl.textContent = season ? (season.label || String(season.year)) : `season ${year}`;
    drawerEl.dataset.drawerSeason = String(year);
  }

  function renderDrawerActivity() {
    const list = document.getElementById("drawer-activity");
    if (!list) return;
    const recent = getRecent().filter((r) => r.playerId === selectedPlayerId).slice(0, 8);
    if (!recent.length) {
      list.innerHTML = '<li class="text-muted">No recent activity for this player.</li>';
      return;
    }
    list.innerHTML = "";
    recent.forEach((r) => {
      const li = document.createElement("li");
      const when = new Date(r.at).toLocaleTimeString();
      li.textContent = `${r.text} · ${when}`;
      list.appendChild(li);
    });
  }

  // Optimistic mutation helpers — the local `slams` array is a session
  // cache; we mutate it immediately so the UI feels instant, then fire the
  // GitHub issue in the background. Real data replaces this on next reload.
  let pendingOptimisticId = 0;
  function nextOptimisticSlamId() {
    pendingOptimisticId += 1;
    return `pending-${pendingOptimisticId}`;
  }

  function applyOptimisticAdd(playerId, season, type, count, clubId) {
    for (let i = 0; i < count; i++) {
      slams.push({
        id: nextOptimisticSlamId(),
        playerId,
        season: parseInt(season, 10),
        type,
        source: "club",
        clubId: clubId || null,
        tournament: null, date: null, location: "Thane",
        videoUrl: null, matchRef: null, notes: null,
        active: true, aggregate: true,
        _pending: true,
      });
    }
  }

  function applyOptimisticRemove(playerId, season, type, count) {
    const targets = slamsForPlayerSeason(playerId, season)
      .filter((s) => s.type === type && s.aggregate !== false)
      .sort((a, b) => (b._pending ? 1 : 0) - (a._pending ? 1 : 0) || b.id.localeCompare(a.id))
      .slice(0, count);
    targets.forEach((row) => { row.active = false; row._pending = true; });
    return targets;
  }

  function refreshAfterMutation() {
    renderTopbar();
    renderPlayerList();
    if (selectedPlayerId) {
      const year = parseInt(drawerEl.dataset.drawerSeason || activeSeasonYear, 10);
      updateDrawerSlamCounts(selectedPlayerId, year);
    }
  }

  // Pending mutations for the currently-open drawer. Flushed on Save changes.
  // Shape: { playerId, adds: {white: [{count, clubId}], black: [...]}, removes: [slamId, ...] }
  let drawerPending = null;

  function ensureDrawerPending() {
    if (!selectedPlayerId) return null;
    if (!drawerPending || drawerPending.playerId !== selectedPlayerId) {
      drawerPending = { playerId: selectedPlayerId, addWhite: 0, addBlack: 0, removedIds: [] };
    }
    return drawerPending;
  }

  function drawerHasUnsavedChanges() {
    return drawerPending && drawerPending.playerId === selectedPlayerId &&
      (drawerPending.addWhite || drawerPending.addBlack || drawerPending.removedIds.length);
  }

  function updateSaveBadge() {
    const badge = document.getElementById("drawer-pending-badge");
    if (!badge) return;
    if (!drawerHasUnsavedChanges()) { badge.hidden = true; badge.textContent = ""; return; }
    const bits = [];
    if (drawerPending.addWhite) bits.push(`+${drawerPending.addWhite} white`);
    if (drawerPending.addBlack) bits.push(`+${drawerPending.addBlack} black`);
    if (drawerPending.removedIds.length) bits.push(`−${drawerPending.removedIds.length}`);
    badge.textContent = bits.join(" · ");
    badge.hidden = false;
  }

  function queueSlamAdd(type, count) {
    const p = ensureDrawerPending();
    if (!p) return;
    const player = players.find((pp) => pp.id === selectedPlayerId);
    const clubId = (player?.clubIds || [])[0] || null;
    const season = parseInt(drawerEl.dataset.drawerSeason || activeSeasonYear, 10);
    if (type === "white") p.addWhite += count; else p.addBlack += count;
    applyOptimisticAdd(selectedPlayerId, season, type, count, clubId);
    refreshAfterMutation();
    updateSaveBadge();
  }

  function queueSlamRemove(type, count) {
    const p = ensureDrawerPending();
    if (!p) return;
    const season = parseInt(drawerEl.dataset.drawerSeason || activeSeasonYear, 10);
    const targets = applyOptimisticRemove(selectedPlayerId, season, type, count);
    if (!targets.length) {
      setStatus(`No aggregate ${type} slams to remove for this season.`, "error");
      return;
    }
    for (const row of targets) {
      const idStr = String(row.id);
      if (idStr.startsWith("pending-")) {
        if (type === "white" && p.addWhite > 0) p.addWhite--;
        else if (type === "black" && p.addBlack > 0) p.addBlack--;
        const idx = slams.indexOf(row);
        if (idx >= 0) slams.splice(idx, 1);
      } else {
        p.removedIds.push(idStr);
      }
    }
    refreshAfterMutation();
    updateSaveBadge();
  }

  function discardDrawerPending() {
    // Revert optimistic mutations in `slams`
    slams = slams.filter((s) => {
      if (!s._pending) return true;
      if (String(s.id).startsWith("pending-")) return false;
      s.active = true; delete s._pending;
      return true;
    });
    drawerPending = null;
    updateSaveBadge();
    refreshAfterMutation();
  }

  async function flushDrawerPending(token) {
    if (!drawerHasUnsavedChanges()) return true;
    const player = players.find((p) => p.id === selectedPlayerId);
    if (!player) return true;
    const season = parseInt(drawerEl.dataset.drawerSeason || activeSeasonYear, 10);
    const clubId = (player.clubIds || [])[0] || "";
    const results = [];
    try {
      if (drawerPending.addWhite > 0) {
        const issue = await createIssue(token, {
          title: `[Bulk slam] ${player.name} — +${drawerPending.addWhite} white`,
          labels: ["bulk-add-slam"],
          body: issueBody({
            "Player id": player.id, Season: String(season),
            Type: "white", Count: String(drawerPending.addWhite),
            Source: "club", "Club id": clubId,
          }),
        });
        pushRecent({ playerId: player.id, text: `+${drawerPending.addWhite} white via #${issue.number}` });
        results.push(`+${drawerPending.addWhite} white (#${issue.number})`);
      }
      if (drawerPending.addBlack > 0) {
        const issue = await createIssue(token, {
          title: `[Bulk slam] ${player.name} — +${drawerPending.addBlack} black`,
          labels: ["bulk-add-slam"],
          body: issueBody({
            "Player id": player.id, Season: String(season),
            Type: "black", Count: String(drawerPending.addBlack),
            Source: "club", "Club id": clubId,
          }),
        });
        pushRecent({ playerId: player.id, text: `+${drawerPending.addBlack} black via #${issue.number}` });
        results.push(`+${drawerPending.addBlack} black (#${issue.number})`);
      }
      for (const slamId of drawerPending.removedIds) {
        const issue = await createIssue(token, {
          title: `[Edit slam] ${slamId} — delete`,
          labels: ["edit-slam"],
          body: issueBody({ "Slam ID": slamId, Action: "delete" }),
        });
        pushRecent({ playerId: player.id, text: `−1 via #${issue.number}` });
        results.push(`delete ${slamId} (#${issue.number})`);
      }
      drawerPending = null;
      updateSaveBadge();
      return true;
    } catch (err) {
      setStatus(`Sync failed: ${err.message}. Some changes may not have been queued.`, "error");
      return false;
    }
  }

  function profileFieldsChanged(player) {
    const name = document.getElementById("drawer-name").value.trim();
    const gender = document.getElementById("drawer-gender").value.toLowerCase();
    const aliases = document.getElementById("drawer-aliases").value.trim();
    const clubIds = readDrawerClubChips().sort().join(",");
    const currentAliases = (player.aliases || []).join(", ");
    const currentClubIds = (player.clubIds || []).slice().sort().join(",");
    return (
      name !== player.name ||
      gender !== (player.gender || "").toLowerCase() ||
      aliases !== currentAliases ||
      clubIds !== currentClubIds
    );
  }

  async function saveProfile() {
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    const player = players.find((p) => p.id === selectedPlayerId);
    if (!player) return;

    const name = document.getElementById("drawer-name").value.trim();
    const gender = document.getElementById("drawer-gender").value;
    const aliases = document.getElementById("drawer-aliases").value.trim();
    const clubIds = readDrawerClubChips().join(", ");

    if (!name || !gender) { setStatus("Name and gender are required.", "error"); return; }

    const hasProfileEdits = profileFieldsChanged(player);
    const hasSlamEdits = drawerHasUnsavedChanges();
    if (!hasProfileEdits && !hasSlamEdits) {
      setStatus("No changes to save.", "success");
      return;
    }

    setStatus("Saving…", "pending");
    const submitBtn = document.getElementById("drawer-save-profile");
    setButtonLoading(submitBtn, true, "Saving…");
    try {
      const parts = [];
      if (hasProfileEdits) {
        const issue = await createIssue(token, {
          title: `[Edit player] ${name}`,
          labels: ["edit-player"],
          body: issueBody({
            "Player ID": player.id,
            Action: "update",
            "Full name": name,
            Gender: gender,
            "Aliases (optional)": aliases,
            "Club IDs (comma-separated)": clubIds,
          }),
        });
        pushRecent({ playerId: player.id, text: `Profile updated via #${issue.number}` });
        parts.push(`profile (#${issue.number})`);
      }
      if (hasSlamEdits) {
        await flushDrawerPending(token);
        parts.push("slams");
      }
      setStatus(`Saved ${parts.join(" + ")}. Site refreshes in ~1 min.`, "success");
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  async function deactivatePlayer() {
    if (!confirm("Deactivate this player? They will be hidden from the public leaderboard.")) return;
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    const player = players.find((p) => p.id === selectedPlayerId);
    if (!player) return;
    setStatus("Deactivating…", "pending");
    try {
      const issue = await createIssue(token, {
        title: `[Edit player] ${player.name} — deactivate`,
        labels: ["edit-player"],
        body: issueBody({ "Player ID": player.id, Action: "deactivate" }),
      });
      pushRecent({ playerId: player.id, text: `Deactivated via #${issue.number}` });
      setStatus(`Issue #${issue.number} queued.`, "success");
      closeDrawer();
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  function slugify(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/[-\s]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function populateNewPlayerClubSelect() {
    const clubSelect = document.getElementById("new-player-club-modal");
    if (!clubSelect) return;
    clubSelect.innerHTML = "";
    const active = clubs.filter((c) => c.active !== false);
    if (!active.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No clubs yet — add one first";
      opt.disabled = true;
      clubSelect.appendChild(opt);
      return;
    }
    active.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      clubSelect.appendChild(opt);
    });
  }

  function resetNewPlayerForm() {
    const name = document.getElementById("new-player-name-modal");
    const aliases = document.getElementById("new-player-aliases-modal");
    const gender = document.getElementById("new-player-gender-modal");
    const slug = document.getElementById("new-player-slug-modal");
    if (name) name.value = "";
    if (aliases) aliases.value = "";
    if (gender) gender.value = "Male";
    if (slug) slug.textContent = "—";
  }

  async function submitNewPlayer() {
    const nameEl = document.getElementById("new-player-name-modal");
    const genderEl = document.getElementById("new-player-gender-modal");
    const clubEl = document.getElementById("new-player-club-modal");
    const aliasesEl = document.getElementById("new-player-aliases-modal");
    if (!nameEl) return;
    const name = nameEl.value.trim();
    const gender = genderEl.value;
    const clubId = clubEl.value || "";
    const aliases = aliasesEl.value.trim();
    if (!name) { setStatus("Player name is required.", "error"); nameEl.focus(); return; }
    if (!gender) { setStatus("Gender is required.", "error"); return; }
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    setStatus("Adding player…", "pending");
    const submitBtn = document.getElementById("new-player-submit-modal");
    setButtonLoading(submitBtn, true, "Adding…");
    try {
      const issue = await createIssue(token, {
        title: `[Player] ${name}`,
        labels: ["add-player"],
        body: issueBody({
          "Full name": name,
          Gender: gender,
          District: "Thane",
          "Club IDs (comma-separated)": clubId,
          "Aliases (optional)": aliases,
        }),
      });
      setStatus(`Issue #${issue.number} queued. Reload in a minute to see the new player.`, "success");
      resetNewPlayerForm();
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function resetClubForm() {
    document.getElementById("modal-club-id").value = "";
    document.getElementById("modal-club-name").value = "";
    document.getElementById("modal-club-contact").value = "";
    document.getElementById("modal-club-notes").value = "";
    document.getElementById("modal-club-form-title").textContent = "New club";
    document.getElementById("modal-club-submit").textContent = "Add club";
    document.getElementById("modal-club-deactivate").hidden = true;
  }

  function openClubEditForm(clubId) {
    const c = clubs.find((cc) => cc.id === clubId);
    if (!c) return;
    document.getElementById("modal-club-id").value = c.id;
    document.getElementById("modal-club-name").value = c.name || "";
    document.getElementById("modal-club-contact").value = c.contact || "";
    document.getElementById("modal-club-notes").value = c.notes || "";
    document.getElementById("modal-club-form-title").textContent = `Edit ${c.name}`;
    document.getElementById("modal-club-submit").textContent = "Save changes";
    const deactBtn = document.getElementById("modal-club-deactivate");
    deactBtn.hidden = false;
    deactBtn.textContent = c.active === false ? "Reactivate" : "Deactivate";
    document.getElementById("modal-add-club-form").hidden = false;
    setTimeout(() => document.getElementById("modal-club-name")?.focus(), 20);
  }

  async function submitClubForm() {
    const id = document.getElementById("modal-club-id").value;
    const name = document.getElementById("modal-club-name").value.trim();
    const contact = document.getElementById("modal-club-contact").value.trim();
    const notes = document.getElementById("modal-club-notes").value.trim();
    if (!name) { setStatus("Club name is required.", "error"); return; }
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    const submitBtn = document.getElementById("modal-club-submit");
    setButtonLoading(submitBtn, true, id ? "Saving…" : "Adding…");
    setStatus(id ? "Updating club…" : "Adding club…", "pending");
    try {
      const issue = id
        ? await createIssue(token, {
            title: `[Edit club] ${name}`,
            labels: ["edit-club"],
            body: issueBody({
              "Club id": id, Action: "update",
              "Name (optional)": name,
              "Contact (optional)": contact,
              "Notes (optional)": notes,
            }),
          })
        : await createIssue(token, {
            title: `[Club] ${name}`,
            labels: ["add-club"],
            body: issueBody({
              "Club name": name, District: "Thane",
              "Contact (optional)": contact,
              "Notes (optional)": notes,
            }),
          });
      setStatus(`Issue #${issue.number} queued.`, "success");
      resetClubForm();
      document.getElementById("modal-add-club-form").hidden = true;
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  async function submitClubDeactivate() {
    const id = document.getElementById("modal-club-id").value;
    if (!id) return;
    const c = clubs.find((cc) => cc.id === id);
    const reactivating = c && c.active === false;
    if (!confirm(reactivating ? `Reactivate ${c.name}?` : `Deactivate ${c.name}? It will be hidden from public listings.`)) return;
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    setStatus(reactivating ? "Reactivating…" : "Deactivating…", "pending");
    try {
      const issue = await createIssue(token, {
        title: reactivating ? `[Edit club] ${c.name} — reactivate` : `[Edit club] ${c.name} — deactivate`,
        labels: ["edit-club"],
        body: issueBody(reactivating
          ? { "Club id": id, Action: "update", "Restore (true/false)": "true" }
          : { "Club id": id, Action: "deactivate" }),
      });
      setStatus(`Issue #${issue.number} queued.`, "success");
      resetClubForm();
      document.getElementById("modal-add-club-form").hidden = true;
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  function resetSeasonForm() {
    document.getElementById("modal-season-editing").value = "";
    document.getElementById("modal-season-year").value = "";
    document.getElementById("modal-season-year").disabled = false;
    document.getElementById("modal-season-start").value = "";
    document.getElementById("modal-season-end").value = "";
    document.getElementById("modal-season-label").value = "";
    document.getElementById("modal-season-available").value = "true";
    document.getElementById("modal-season-available-wrap").hidden = true;
    document.getElementById("modal-season-form-title").textContent = "New season";
    document.getElementById("modal-season-submit").textContent = "Add season";
  }

  function openSeasonEditForm(year) {
    const s = seasons.find((ss) => parseInt(ss.year, 10) === parseInt(year, 10));
    if (!s) return;
    document.getElementById("modal-season-editing").value = String(year);
    document.getElementById("modal-season-year").value = s.year;
    document.getElementById("modal-season-year").disabled = true;
    document.getElementById("modal-season-start").value = s.start;
    document.getElementById("modal-season-end").value = s.end;
    document.getElementById("modal-season-label").value = s.label || "";
    document.getElementById("modal-season-available").value = s.available === false ? "false" : "true";
    document.getElementById("modal-season-available-wrap").hidden = false;
    document.getElementById("modal-season-form-title").textContent = `Edit ${s.label || s.year}`;
    document.getElementById("modal-season-submit").textContent = "Save changes";
    document.getElementById("modal-add-season-form").hidden = false;
  }

  async function submitSeasonForm() {
    const editing = document.getElementById("modal-season-editing").value;
    const year = document.getElementById("modal-season-year").value.trim();
    const start = document.getElementById("modal-season-start").value;
    const end = document.getElementById("modal-season-end").value;
    const label = document.getElementById("modal-season-label").value.trim();
    const available = document.getElementById("modal-season-available").value;
    if (!year || !start || !end) { setStatus("Year, start, and end are required.", "error"); return; }
    if (end <= start) { setStatus("End must be after start.", "error"); return; }
    const token = getStoredToken();
    if (!token) { show(loginEl); return; }
    const submitBtn = document.getElementById("modal-season-submit");
    setButtonLoading(submitBtn, true, editing ? "Saving…" : "Adding…");
    setStatus(editing ? "Updating season…" : "Adding season…", "pending");
    try {
      const issue = editing
        ? await createIssue(token, {
            title: `[Edit season] ${year}`,
            labels: ["edit-season"],
            body: issueBody({
              Season: String(year),
              Label: label,
              "Start date": start,
              "End date": end,
              Available: available,
            }),
          })
        : await createIssue(token, {
            title: `[Season] ${label || year}`,
            labels: ["add-season"],
            body: issueBody({
              "Start year": year, "Start date": start, "End date": end,
              Label: label,
            }),
          });
      setStatus(`Issue #${issue.number} queued.`, "success");
      resetSeasonForm();
      document.getElementById("modal-add-season-form").hidden = true;
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  function renderModalClubs() {
    const list = document.getElementById("modal-club-list");
    if (!list) return;
    list.innerHTML = "";
    clubs.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<div><strong>${escapeHtml(c.name)}</strong>` +
        (c.active === false ? ' <span class="text-muted">(inactive)</span>' : "") +
        `</div>` +
        `<button type="button" class="btn-admin btn-secondary btn-small" data-edit-club="${c.id}">Edit</button>`;
      list.appendChild(li);
    });
  }

  function renderModalSeasons() {
    const list = document.getElementById("modal-season-list");
    if (!list) return;
    list.innerHTML = "";
    seasons.forEach((s) => {
      const li = document.createElement("li");
      const isCurrent = parseInt(s.year, 10) === currentSeasonYear;
      li.innerHTML =
        `<div><strong>${escapeHtml(s.label || String(s.year))}</strong>` +
        (isCurrent ? ' <span class="text-muted">· current</span>' : "") +
        `<br><span class="text-muted">${s.start} → ${s.end}${s.available === false ? " · hidden" : ""}</span></div>` +
        `<button type="button" class="btn-admin btn-secondary btn-small" data-edit-season="${s.year}">Edit</button>`;
      list.appendChild(li);
    });
  }

  // Thin wrappers so existing click handlers still resolve.
  function editClub(clubId) { switchModalTab("clubs"); openClubEditForm(clubId); }
  function editSeason(year) { switchModalTab("seasons"); openSeasonEditForm(year); }

  function openSettings() {
    populateNewPlayerClubSelect();
    resetNewPlayerForm();
    renderModalClubs();
    renderModalSeasons();
    switchModalTab("players");
    settingsModal.hidden = false;
    document.body.classList.add("has-modal");
    setTimeout(() => document.getElementById("new-player-name-modal")?.focus(), 20);
  }

  function closeSettings() {
    settingsModal.hidden = true;
    document.body.classList.remove("has-modal");
  }

  // ----- Wire up all event handlers -----

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

  async function bootstrapSession(token) {
    const user = await fetchGitHubUser(token);
    if (!(await isAllowedUser(user.login))) {
      setStoredToken(null);
      show(deniedEl);
      return;
    }
    setStoredToken(token);
    try { sessionStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
    document.getElementById("admin-user-label").textContent = `@${user.login}`;
    try {
      await loadCatalog();
      renderTopbar();
      renderPlayerList();
      wireDrawerClubCombobox();
      show(appEl);
    } catch (err) {
      setStoredToken(null);
      show(loginEl);
      if (loginError) { loginError.textContent = err.message; loginError.hidden = false; }
    }
  }

  function signOut() {
    setStoredToken(null);
    show(loginEl);
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", signOut);
  document.getElementById("admin-logout-denied")?.addEventListener("click", signOut);

  document.getElementById("admin-player-search")?.addEventListener("input", renderPlayerList);

  document.getElementById("admin-player-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-player]");
    if (!btn) return;
    openDrawer(btn.dataset.openPlayer);
  });

  document.getElementById("admin-drawer-close")?.addEventListener("click", () => closeDrawer());
  drawerBackdrop?.addEventListener("click", () => closeDrawer());

  document.getElementById("drawer-save-profile")?.addEventListener("click", saveProfile);
  document.getElementById("drawer-deactivate")?.addEventListener("click", deactivatePlayer);
  document.getElementById("drawer-cancel")?.addEventListener("click", () => {
    if (drawerHasUnsavedChanges()) {
      if (!confirm("Discard unsaved changes?")) return;
      discardDrawerPending();
    }
    closeDrawer(true);
  });

  document.querySelectorAll("[data-slam-bulk]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!selectedPlayerId) return;
      const type = btn.dataset.slamBulk;
      const op = btn.dataset.op;
      const count = op === "add-5" ? 5 : 1;
      if (op === "remove") queueSlamRemove(type, count);
      else queueSlamAdd(type, count);
    });
  });

  // Settings modal (Manage) — three tabs: Players / Clubs / Seasons
  document.getElementById("admin-settings-btn")?.addEventListener("click", openSettings);
  document.getElementById("admin-settings-close")?.addEventListener("click", closeSettings);
  document.getElementById("admin-settings-backdrop")?.addEventListener("click", closeSettings);

  function switchModalTab(tab) {
    document.querySelectorAll(".admin-modal-tab").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.modalTab === tab);
    });
    const players = document.getElementById("modal-panel-players");
    const clubs = document.getElementById("modal-panel-clubs");
    const seasons = document.getElementById("modal-panel-seasons");
    if (players) players.hidden = tab !== "players";
    if (clubs) clubs.hidden = tab !== "clubs";
    if (seasons) seasons.hidden = tab !== "seasons";
  }
  document.querySelectorAll(".admin-modal-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchModalTab(tab.dataset.modalTab));
  });

  // Inline add-player form inside settings modal
  document.getElementById("new-player-submit-modal")?.addEventListener("click", submitNewPlayer);
  document.getElementById("new-player-cancel-modal")?.addEventListener("click", () => {
    resetNewPlayerForm();
    closeSettings();
  });
  document.getElementById("new-player-name-modal")?.addEventListener("input", (e) => {
    const slugEl = document.getElementById("new-player-slug-modal");
    if (slugEl) slugEl.textContent = slugify(e.target.value) || "—";
  });

  // Close-form buttons inside settings modal
  document.querySelectorAll("[data-form-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = btn.dataset.formClose;
      if (form === "club") document.getElementById("modal-add-club-form").hidden = true;
      if (form === "season") document.getElementById("modal-add-season-form").hidden = true;
    });
  });

  document.getElementById("modal-add-club-btn")?.addEventListener("click", () => {
    resetClubForm();
    document.getElementById("modal-add-club-form").hidden = false;
    setTimeout(() => document.getElementById("modal-club-name")?.focus(), 20);
  });
  document.getElementById("modal-club-cancel")?.addEventListener("click", () => {
    resetClubForm();
    document.getElementById("modal-add-club-form").hidden = true;
  });
  document.getElementById("modal-club-submit")?.addEventListener("click", submitClubForm);
  document.getElementById("modal-club-deactivate")?.addEventListener("click", submitClubDeactivate);

  document.getElementById("modal-add-season-btn")?.addEventListener("click", () => {
    resetSeasonForm();
    document.getElementById("modal-add-season-form").hidden = false;
    setTimeout(() => document.getElementById("modal-season-year")?.focus(), 20);
  });
  document.getElementById("modal-season-cancel")?.addEventListener("click", () => {
    resetSeasonForm();
    document.getElementById("modal-add-season-form").hidden = true;
  });
  document.getElementById("modal-season-submit")?.addEventListener("click", submitSeasonForm);

  document.getElementById("modal-club-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit-club]");
    if (btn) editClub(btn.dataset.editClub);
  });
  document.getElementById("modal-season-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit-season]");
    if (btn) editSeason(btn.dataset.editSeason);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (settingsModal && !settingsModal.hidden) closeSettings();
      else if (drawerEl && !drawerEl.hidden) closeDrawer();
    }
    if (e.key === "/" && document.activeElement !== document.getElementById("admin-player-search")) {
      const el = document.getElementById("admin-player-search");
      if (el && appEl && !appEl.hidden) { e.preventDefault(); el.focus(); }
    }
  });

  // Boot
  const bootToken = getStoredToken();
  if (bootToken) {
    bootstrapSession(bootToken).catch(() => show(loginEl));
  } else {
    show(loginEl);
  }
})();

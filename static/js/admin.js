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

  function issueBody(fields) {
    return Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([label, value]) => `### ${label}\n\n${value}`)
      .join("\n\n");
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
  }

  /** @deprecated Use populatePlayerClubSelect — kept for cached admin.js compatibility */
  function renderClubPicker() {
    populatePlayerClubSelect();
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
    const [playersData, clubsData, slamsData] = await Promise.all([
      fetchJson(config.playersUrl),
      fetchJson(config.clubsUrl),
      fetchJson(config.slamsUrl),
    ]);
    players = playersData.players || [];
    clubs = clubsData.clubs || [];
    slams = (slamsData.slams || []).filter((s) => s.active !== false);

    populateSelect(
      document.getElementById("slam-player"),
      players.map((p) => ({ id: p.id, name: formatPlayerOption(p) })),
      { blank: true },
    );
    populatePlayerClubSelect();
    refreshSlamClubOptions();
    populateEditFilters();
    updateCatalogStats();
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
        ["player", "club", "slam", "edit"].forEach((panel) => {
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
          Season: "2025",
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

  setupTabs();
  setupSlugPreview("player-name", "player-slug-preview");
  setupSlugPreview("club-name", "club-slug-preview");
  setupSourceToggle();
  setupSlamPlayerClubLink();
  setupEditSlamPicker();
  setupEditToggle();

  const token = getStoredToken();
  if (token) {
    bootstrapSession(token).catch(() => show(loginEl));
  } else {
    show(loginEl);
  }
})();

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
    statusEl.textContent = message;
    statusEl.className = `admin-status${type ? ` admin-status--${type}` : ""}`;
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
      opt.textContent = "—";
      select.appendChild(opt);
    }
    options.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = typeof item === "string" ? item : item[valueKey];
      opt.textContent = typeof item === "string" ? item : item[labelKey];
      select.appendChild(opt);
    });
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

    populateSelect(document.getElementById("player-clubs"), clubs);
    populateSelect(document.getElementById("slam-player"), players, { blank: true });
    populateSelect(document.getElementById("slam-club"), clubs, { blank: true });
    populateSelect(
      document.getElementById("edit-slam-id"),
      slams.map((s) => ({
        id: s.id,
        name: `${s.id} — ${s.type} (${players.find((p) => p.id === s.playerId)?.name || s.playerId})`,
      })),
      { valueKey: "id", labelKey: "name", blank: true },
    );
  }

  function setupTabs() {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        const name = tab.dataset.tab;
        ["player", "club", "slam", "edit"].forEach((panel) => {
          const el = document.getElementById(`panel-${panel}`);
          if (el) el.hidden = panel !== name;
        });
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
    }
    source?.addEventListener("change", update);
    update();
  }

  function setupEditToggle() {
    const action = document.getElementById("edit-action");
    const fields = document.getElementById("edit-fields");
    action?.addEventListener("change", () => {
      if (fields) fields.hidden = action.value === "delete";
    });
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
    await loadCatalog();
    show(appEl);
  }

  function signOut() {
    setStoredToken(null);
    show(loginEl);
  }

  document.getElementById("admin-token-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = event.target.token.value.trim();
    try {
      await bootstrapSession(token);
      event.target.reset();
    } catch (err) {
      if (loginError) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      }
    }
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

    const clubIds = [...form.clubIds.selectedOptions].map((o) => o.value).join(", ");
    setStatus("Submitting…", "pending");
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
    } catch (err) {
      setStatus(err.message, "error");
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
    } catch (err) {
      setStatus(err.message, "error");
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
    } catch (err) {
      setStatus(err.message, "error");
    }
  });

  document.getElementById("admin-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return show(loginEl);

    const form = event.target;
    const slamId = form.slamId.value;
    if (!slamId) {
      setStatus("Slam ID is required.", "error");
      return;
    }

    setStatus("Submitting…", "pending");
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
      form.reset();
    } catch (err) {
      setStatus(err.message, "error");
    }
  });

  setupTabs();
  setupSlugPreview("player-name", "player-slug-preview");
  setupSlugPreview("club-name", "club-slug-preview");
  setupSourceToggle();
  setupEditToggle();

  const token = getStoredToken();
  if (token) {
    bootstrapSession(token).catch(() => show(loginEl));
  } else {
    show(loginEl);
  }
})();

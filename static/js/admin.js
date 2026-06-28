(function () {
  "use strict";

  const config = window.CARROM_ADMIN || {};
  const TOKEN_KEY = "carrom_admin_token";
  const USER_KEY = "carrom_admin_user";
  const OTHER_VALUE = "__other__";

  const loginEl = document.getElementById("admin-login");
  const deniedEl = document.getElementById("admin-denied");
  const appEl = document.getElementById("admin-app");
  const tokenForm = document.getElementById("admin-token-form");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const logoutDeniedBtn = document.getElementById("admin-logout-denied");
  const userLabel = document.getElementById("admin-user-label");
  const form = document.getElementById("admin-player-form");
  const statusEl = document.getElementById("admin-form-status");
  const loginError = document.getElementById("admin-login-error");
  const existingSelect = document.getElementById("player-existing");
  const nameInput = document.getElementById("player-name");
  const nameSuggestions = document.getElementById("player-name-suggestions");
  const clubSelect = document.getElementById("player-club");
  const clubOther = document.getElementById("player-club-other");
  const districtSelect = document.getElementById("player-district");
  const districtOther = document.getElementById("player-district-other");
  const genderSelect = document.getElementById("player-gender");

  let playerRegistry = [];
  let formInitialized = false;

  function hideAll() {
    [loginEl, deniedEl, appEl].forEach((el) => {
      if (el) el.hidden = true;
    });
  }

  function show(el) {
    hideAll();
    if (el) el.hidden = false;
  }

  function setLoginError(message) {
    if (!loginError) return;
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    } else {
      loginError.textContent = "";
      loginError.hidden = true;
    }
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

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setStoredUser(user) {
    try {
      if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      else sessionStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  async function fetchAllowlist() {
    const res = await fetch(config.allowlistUrl);
    if (!res.ok) throw new Error("Could not load admin allowlist");
    return res.json();
  }

  async function fetchFormOptions() {
    const res = await fetch(config.formOptionsUrl);
    if (!res.ok) throw new Error("Could not load form options");
    return res.json();
  }

  async function fetchPlayers() {
    const res = await fetch(config.playersUrl);
    if (!res.ok) throw new Error("Could not load player registry");
    const data = await res.json();
    return data.players || [];
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
    const allowlist = await fetchAllowlist();
    return (allowlist.allowedUsers || []).includes(login);
  }

  function titleCaseGender(value) {
    if (!value) return "";
    const lower = value.trim().toLowerCase();
    if (lower === "male") return "Male";
    if (lower === "female") return "Female";
    if (lower === "other") return "Other";
    return value;
  }

  function populateSelect(select, values, { includeBlank = true, includeOther = false } = {}) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";

    if (includeBlank) {
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "—";
      select.appendChild(blank);
    }

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    if (includeOther) {
      const other = document.createElement("option");
      other.value = OTHER_VALUE;
      other.textContent = "Other…";
      select.appendChild(other);
    }

    if ([...select.options].some((opt) => opt.value === current)) {
      select.value = current;
    }
  }

  function toggleOtherField(select, otherInput) {
    if (!select || !otherInput) return;
    const showOther = select.value === OTHER_VALUE;
    otherInput.hidden = !showOther;
    otherInput.required = showOther;
    if (!showOther) otherInput.value = "";
  }

  function setSelectOrOther(select, otherInput, value) {
    if (!select || !otherInput) return;
    const trimmed = (value || "").trim();
    if (!trimmed) {
      select.value = "";
      otherInput.value = "";
      otherInput.hidden = true;
      return;
    }

    const match = [...select.options].some((opt) => opt.value === trimmed);
    if (match) {
      select.value = trimmed;
      otherInput.value = "";
      otherInput.hidden = true;
    } else {
      select.value = OTHER_VALUE;
      otherInput.value = trimmed;
      otherInput.hidden = false;
    }
  }

  function readSelectOrOther(select, otherInput) {
    if (!select) return "";
    if (select.value === OTHER_VALUE) {
      return otherInput ? otherInput.value.trim() : "";
    }
    return select.value.trim();
  }

  function populateNameSuggestions(players) {
    if (!nameSuggestions) return;
    nameSuggestions.innerHTML = "";
    players
      .map((player) => player.name)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        nameSuggestions.appendChild(option);
      });
  }

  function populateExistingPlayers(players) {
    if (!existingSelect) return;
    const current = existingSelect.value;
    existingSelect.innerHTML = "";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— New player —";
    existingSelect.appendChild(blank);

    players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((player) => {
        const option = document.createElement("option");
        option.value = player.id;
        option.textContent = player.name;
        existingSelect.appendChild(option);
      });

    if ([...existingSelect.options].some((opt) => opt.value === current)) {
      existingSelect.value = current;
    }
  }

  function fillFormFromPlayer(player) {
    if (!player || !form) return;
    if (nameInput) nameInput.value = player.name || "";

    const profile = player.profile || {};
    setSelectOrOther(clubSelect, clubOther, profile.club);
    setSelectOrOther(districtSelect, districtOther, profile.district);

    if (genderSelect) {
      genderSelect.value = titleCaseGender(profile.gender);
    }

    if (form.aliases) {
      form.aliases.value = (player.aliases || []).join(", ");
    }
    if (form.notes) {
      form.notes.value = "";
    }
  }

  function resetPlayerForm() {
    if (!form) return;
    form.reset();
    if (existingSelect) existingSelect.value = "";
    toggleOtherField(clubSelect, clubOther);
    toggleOtherField(districtSelect, districtOther);
  }

  async function initPlayerForm() {
    if (!form) return;

    const [options, players] = await Promise.all([fetchFormOptions(), fetchPlayers()]);
    playerRegistry = players;

    populateSelect(clubSelect, options.clubs || [], { includeOther: true });
    populateSelect(districtSelect, options.districts || [], { includeOther: true });
    populateExistingPlayers(players);
    populateNameSuggestions(players);

    if (formInitialized) return;
    formInitialized = true;

    clubSelect?.addEventListener("change", () => toggleOtherField(clubSelect, clubOther));
    districtSelect?.addEventListener("change", () => toggleOtherField(districtSelect, districtOther));

    existingSelect?.addEventListener("change", () => {
      const playerId = existingSelect.value;
      if (!playerId) {
        resetPlayerForm();
        return;
      }
      const player = playerRegistry.find((entry) => entry.id === playerId);
      fillFormFromPlayer(player);
    });

    nameInput?.addEventListener("change", () => {
      const typed = nameInput.value.trim().toLowerCase();
      if (!typed) return;
      const match = playerRegistry.find((entry) => entry.name.trim().toLowerCase() === typed);
      if (match && existingSelect) {
        existingSelect.value = match.id;
        fillFormFromPlayer(match);
      }
    });
  }

  function buildIssueBody(values) {
    return [
      "### Full name",
      "",
      values.name,
      "",
      "### Club name",
      "",
      values.club || "",
      "",
      "### District / city",
      "",
      values.district || "",
      "",
      "### Gender",
      "",
      values.gender || "",
      "",
      "### Aliases (optional)",
      "",
      values.aliases || "",
      "",
      "### Notes (optional)",
      "",
      values.notes || "",
    ].join("\n");
  }

  async function createIssue(token, values) {
    const [owner, repo] = config.repo.split("/");
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `[Player] ${values.name}`,
        labels: ["add-player"],
        body: buildIssueBody(values),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("Token lacks Issues permission on this repo. Create a new token with Issues: Read and write.");
      }
      throw new Error(data.message || "Could not create GitHub issue");
    }
    return data;
  }

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `admin-status${type ? ` admin-status--${type}` : ""}`;
  }

  async function bootstrapSession(token) {
    const user = await fetchGitHubUser(token);
    if (!(await isAllowedUser(user.login))) {
      setStoredToken(null);
      setStoredUser(null);
      show(deniedEl);
      return;
    }
    setStoredToken(token);
    setStoredUser(user);
    if (userLabel) userLabel.textContent = `Signed in as @${user.login}`;
    show(appEl);
    try {
      await initPlayerForm();
    } catch (err) {
      setStatus(err.message || "Could not load form options.", "error");
    }
  }

  function signOut() {
    setStoredToken(null);
    setStoredUser(null);
    setLoginError("");
    if (tokenForm) tokenForm.reset();
    playerRegistry = [];
    formInitialized = false;
    show(loginEl);
  }

  async function init() {
    const token = getStoredToken();
    if (token) {
      try {
        await bootstrapSession(token);
        return;
      } catch (err) {
        setStoredToken(null);
        setStoredUser(null);
        setLoginError(err.message || "Session expired. Sign in again.");
      }
    }
    show(loginEl);
  }

  if (tokenForm) {
    tokenForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setLoginError("");
      const token = tokenForm.token.value.trim();
      if (!token) return;

      const submitBtn = tokenForm.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await bootstrapSession(token);
        if (getStoredToken()) tokenForm.reset();
        else setLoginError("Sign in failed. Check your token and allowlist.");
      } catch (err) {
        setLoginError(err.message || "Sign in failed.");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (logoutBtn) logoutBtn.addEventListener("click", signOut);
  if (logoutDeniedBtn) logoutDeniedBtn.addEventListener("click", signOut);

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = getStoredToken();
      if (!token) {
        show(loginEl);
        return;
      }

      const values = {
        name: form.name.value.trim(),
        club: readSelectOrOther(clubSelect, clubOther),
        district: readSelectOrOther(districtSelect, districtOther),
        gender: form.gender.value.trim(),
        aliases: form.aliases.value.trim(),
        notes: form.notes.value.trim(),
      };

      if (!values.name) {
        setStatus("Full name is required.", "error");
        return;
      }

      const submitBtn = document.getElementById("admin-submit-btn");
      if (submitBtn) submitBtn.disabled = true;
      setStatus("Submitting…", "pending");

      try {
        const issue = await createIssue(token, values);
        setStatus(`Submitted! Issue #${issue.number} created — data will commit to main after validation.`, "success");
        resetPlayerForm();
      } catch (err) {
        setStatus(err.message || "Submission failed.", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  init();
})();

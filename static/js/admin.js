(function () {
  "use strict";

  const config = window.CARROM_ADMIN || {};
  const TOKEN_KEY = "carrom_admin_token";
  const USER_KEY = "carrom_admin_user";

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
  }

  function signOut() {
    setStoredToken(null);
    setStoredUser(null);
    setLoginError("");
    if (tokenForm) tokenForm.reset();
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
        club: form.club.value.trim(),
        district: form.district.value.trim(),
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
        setStatus(`Submitted! Issue #${issue.number} created — a PR will follow after validation.`, "success");
        form.reset();
      } catch (err) {
        setStatus(err.message || "Submission failed.", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  init();
})();

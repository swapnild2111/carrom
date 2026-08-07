<script lang="ts">
  // Manage modal — three tabs (Players / Clubs / Seasons). Handles:
  //   - Add player (form)
  //   - Add + edit clubs
  //   - Add + edit seasons
  //
  // Ports the Hugo admin's ManageModal wholesale to Svelte 5.
  import { createPlayer, createClub, updateClub, createSeason, updateSeason, slugify } from "@/lib/firestore-writes";
  import type { Club, Season } from "@/lib/firestore-schema";

  interface Props {
    onClose: () => void;
    clubs: Club[];
    seasons: Season[];
    // Route success/error/pending events into the parent's activity bell
    // so the admin has one unified notification surface.
    onActivity?: (kind: "success" | "error" | "pending", text: string) => void;
  }
  let { onClose, clubs, seasons, onActivity }: Props = $props();

  let activeTab: "players" | "clubs" | "seasons" = $state("players");

  // ── Add player form state ──────────────────────────────────────
  let playerName = $state("");
  let playerGender: "male" | "female" = $state("male");
  let playerAliases = $state("");
  let playerPrimaryClub = $state("");
  let playerSubmitting = $state(false);

  let playerSlug = $derived(slugify(playerName));

  async function submitAddPlayer() {
    if (!playerName.trim()) {
      onActivity?.("error", "Player name is required.");
      return;
    }
    playerSubmitting = true;
    onActivity?.("pending", "Adding player…");
    try {
      const aliases = playerAliases.split(",").map((a) => a.trim()).filter(Boolean);
      const clubIds = playerPrimaryClub ? [playerPrimaryClub] : [];
      await createPlayer({
        name: playerName.trim(),
        gender: playerGender,
        aliases,
        clubIds,
      });
      onActivity?.("success", `Added player ${playerName}.`);
      // Reset form
      playerName = "";
      playerAliases = "";
      playerPrimaryClub = "";
    } catch (e) {
      onActivity?.("error", e instanceof Error ? e.message : String(e));
    } finally {
      playerSubmitting = false;
    }
  }

  // ── Club form state (add + edit) ──────────────────────────────
  let clubFormVisible = $state(false);
  let clubEditingId: string | null = $state(null);
  let clubName = $state("");
  let clubContact = $state("");
  let clubNotes = $state("");

  function openAddClub() {
    clubEditingId = null;
    clubName = "";
    clubContact = "";
    clubNotes = "";
    clubFormVisible = true;
  }

  function openEditClub(club: Club) {
    clubEditingId = club.id;
    clubName = club.name ?? "";
    clubContact = club.contact ?? "";
    clubNotes = club.notes ?? "";
    clubFormVisible = true;
  }

  function closeClubForm() {
    clubFormVisible = false;
    clubEditingId = null;
  }

  async function submitClubForm() {
    if (!clubName.trim()) {
      onActivity?.("error", "Club name is required.");
      return;
    }
    onActivity?.("pending", clubEditingId ? "Saving club…" : "Adding club…");
    try {
      if (clubEditingId) {
        const before = clubs.find((c) => c.id === clubEditingId) ?? {};
        await updateClub(clubEditingId, before, {
          name: clubName.trim(),
          contact: clubContact.trim() || null,
          notes: clubNotes.trim() || null,
        });
        onActivity?.("success", `Saved changes to ${clubName}.`);
      } else {
        await createClub({
          name: clubName.trim(),
          contact: clubContact.trim() || undefined,
          notes: clubNotes.trim() || undefined,
        });
        onActivity?.("success", `Added club ${clubName}.`);
      }
      closeClubForm();
    } catch (e) {
      onActivity?.("error", e instanceof Error ? e.message : String(e));
    }
  }

  // ── Season form state (add + edit) ────────────────────────────
  let seasonFormVisible = $state(false);
  let seasonEditingYear: number | null = $state(null);
  let seasonYear = $state("");
  let seasonStart = $state("");
  let seasonEnd = $state("");
  let seasonLabel = $state("");
  let seasonAvailable = $state(true);
  let seasonCeremonyUrl = $state("");

  function openAddSeason() {
    seasonEditingYear = null;
    seasonYear = "";
    seasonStart = "";
    seasonEnd = "";
    seasonLabel = "";
    seasonAvailable = true;
    seasonCeremonyUrl = "";
    seasonFormVisible = true;
  }

  function openEditSeason(s: Season) {
    seasonEditingYear = s.year;
    seasonYear = String(s.year);
    seasonStart = s.start;
    seasonEnd = s.end;
    seasonLabel = s.label ?? "";
    seasonAvailable = s.available !== false;
    seasonCeremonyUrl = s.ceremonyVideoUrl ?? "";
    seasonFormVisible = true;
  }

  function closeSeasonForm() {
    seasonFormVisible = false;
    seasonEditingYear = null;
  }

  async function submitSeasonForm() {
    const y = parseInt(seasonYear, 10);
    if (!y || y < 2000 || y > 2100) {
      onActivity?.("error", "Start year must be between 2000 and 2100.");
      return;
    }
    if (!seasonStart || !seasonEnd) {
      onActivity?.("error", "Start and end dates are required.");
      return;
    }
    if (seasonEnd <= seasonStart) {
      onActivity?.("error", "End date must be after start date.");
      return;
    }
    const label = seasonLabel.trim() || `${y}–${String(y + 1).slice(-2)}`;
    onActivity?.("pending", seasonEditingYear ? "Saving season…" : "Adding season…");
    try {
      const ceremonyVideoUrl = seasonCeremonyUrl.trim() || null;
      if (seasonEditingYear) {
        const before = seasons.find((s) => s.year === seasonEditingYear) ?? {};
        await updateSeason(seasonEditingYear, before, {
          label,
          start: seasonStart,
          end: seasonEnd,
          available: seasonAvailable,
          ceremonyVideoUrl,
        });
        onActivity?.("success", `Saved changes to ${label}.`);
      } else {
        await createSeason({ year: y, label, start: seasonStart, end: seasonEnd });
        // If a ceremony URL was entered on the add form, save it as a follow-up update.
        if (ceremonyVideoUrl) {
          await updateSeason(y, {}, { ceremonyVideoUrl });
        }
        onActivity?.("success", `Added season ${label}.`);
      }
      closeSeasonForm();
    } catch (e) {
      onActivity?.("error", e instanceof Error ? e.message : String(e));
    }
  }

</script>

<div class="admin-modal" role="dialog" aria-labelledby="manage-title">
  <div class="admin-modal-backdrop" onclick={onClose} role="presentation"></div>
  <div class="admin-modal-panel">
    <header class="admin-modal-header">
      <h3 id="manage-title">Manage</h3>
      <button type="button" class="admin-modal-close" onclick={onClose} aria-label="Close">✕</button>
    </header>

    <div class="admin-modal-tabs" role="tablist">
      <button type="button" class:is-active={activeTab === "players"} onclick={() => (activeTab = "players")}>Players</button>
      <button type="button" class:is-active={activeTab === "clubs"} onclick={() => (activeTab = "clubs")}>Clubs</button>
      <button type="button" class:is-active={activeTab === "seasons"} onclick={() => (activeTab = "seasons")}>Seasons</button>
    </div>

    <div class="admin-modal-body">
      {#if activeTab === "players"}
        <div class="admin-modal-panel-header">
          <div>
            <h4>Add a player</h4>
            <p class="field-hint">Registers a new Thane player.</p>
          </div>
        </div>
        <div class="admin-modal-form">
          <label class="form-field">
            <span>Full name <span class="required">*</span></span>
            <input type="text" bind:value={playerName} placeholder="e.g. Kunal Raut" autocomplete="off" />
            <p class="field-hint">Profile URL slug: <code>{playerSlug || "—"}</code></p>
          </label>
          <div class="form-row form-row-2">
            <label class="form-field">
              <span>Gender <span class="required">*</span></span>
              <select bind:value={playerGender}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label class="form-field">
              <span>Primary club</span>
              <select bind:value={playerPrimaryClub}>
                <option value="">— none —</option>
                {#each clubs.filter((c) => c.active !== false) as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </select>
            </label>
          </div>
          <label class="form-field">
            <span>Aliases <span class="text-muted">(optional)</span></span>
            <input type="text" bind:value={playerAliases} placeholder="Comma-separated" />
          </label>
          <div class="admin-modal-form-actions admin-modal-form-actions-end">
            <button type="button" class="btn-admin btn-secondary" onclick={onClose}>Cancel</button>
            <button type="button" class="btn-admin btn-primary" onclick={submitAddPlayer} disabled={playerSubmitting}>
              {playerSubmitting ? "Adding…" : "Add player"}
            </button>
          </div>
        </div>
      {:else if activeTab === "clubs"}
        <div class="admin-modal-panel-header">
          <div>
            <h4>Clubs</h4>
            <p class="field-hint">{clubs.filter((c) => c.active !== false).length} clubs registered.</p>
          </div>
          <button type="button" class="btn-admin btn-primary" onclick={openAddClub}>+ Add club</button>
        </div>
        <ul class="admin-modal-list">
          {#each clubs as c (c.id)}
            <li>
              <div>
                <strong>{c.name}</strong>
                {#if c.active === false}<span class="text-muted"> (inactive)</span>{/if}
              </div>
              <button type="button" class="btn-admin btn-secondary btn-small" onclick={() => openEditClub(c)}>Edit</button>
            </li>
          {/each}
        </ul>
        {#if clubFormVisible}
          <div class="admin-modal-form">
            <div class="admin-modal-form-header">
              <h5>{clubEditingId ? `Edit ${clubName}` : "New club"}</h5>
              <button type="button" class="admin-modal-close" onclick={closeClubForm} aria-label="Close form">✕</button>
            </div>
            <label class="form-field">
              <span>Club name <span class="required">*</span></span>
              <input type="text" bind:value={clubName} placeholder="e.g. Shakti Club" autocomplete="off" />
            </label>
            <div class="form-row form-row-2">
              <label class="form-field">
                <span>Contact <span class="text-muted">(optional)</span></span>
                <input type="text" bind:value={clubContact} />
              </label>
              <label class="form-field">
                <span>Notes <span class="text-muted">(optional)</span></span>
                <input type="text" bind:value={clubNotes} />
              </label>
            </div>
            <div class="admin-modal-form-actions admin-modal-form-actions-end">
              <button type="button" class="btn-admin btn-secondary" onclick={closeClubForm}>Cancel</button>
              <button type="button" class="btn-admin btn-primary" onclick={submitClubForm}>
                {clubEditingId ? "Save changes" : "Add club"}
              </button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="admin-modal-panel-header">
          <div>
            <h4>Seasons</h4>
            <p class="field-hint">{seasons.length} seasons configured.</p>
          </div>
          <button type="button" class="btn-admin btn-primary" onclick={openAddSeason}>+ Add season</button>
        </div>
        <ul class="admin-modal-list">
          {#each seasons as s (s.year)}
            <li>
              <div>
                <strong>{s.label || s.year}</strong>
                <br />
                <span class="text-muted">{s.start} → {s.end}{s.available === false ? " · hidden" : ""}</span>
              </div>
              <button type="button" class="btn-admin btn-secondary btn-small" onclick={() => openEditSeason(s)}>Edit</button>
            </li>
          {/each}
        </ul>
        {#if seasonFormVisible}
          <div class="admin-modal-form">
            <div class="admin-modal-form-header">
              <h5>{seasonEditingYear ? `Edit ${seasonLabel || seasonEditingYear}` : "New season"}</h5>
              <button type="button" class="admin-modal-close" onclick={closeSeasonForm} aria-label="Close form">✕</button>
            </div>
            <p class="field-hint">Fiscal-year season, April to March. Label auto-fills as "YYYY–YY" if left blank.</p>
            <div class="form-row form-row-3">
              <label class="form-field">
                <span>Start year <span class="required">*</span></span>
                <input type="number" bind:value={seasonYear} min="2000" max="2100" placeholder="2026" disabled={seasonEditingYear !== null} />
              </label>
              <label class="form-field">
                <span>Start date <span class="required">*</span></span>
                <input type="date" bind:value={seasonStart} />
              </label>
              <label class="form-field">
                <span>End date <span class="required">*</span></span>
                <input type="date" bind:value={seasonEnd} />
              </label>
            </div>
            <div class="form-row form-row-2">
              <label class="form-field">
                <span>Label</span>
                <input type="text" bind:value={seasonLabel} placeholder="Auto: 2026–27" />
              </label>
              {#if seasonEditingYear}
                <label class="form-field">
                  <span>Public visibility</span>
                  <select bind:value={seasonAvailable}>
                    <option value={true}>Visible</option>
                    <option value={false}>Hidden</option>
                  </select>
                </label>
              {/if}
            </div>
            <label class="form-field">
              <span>Award ceremony video URL <span class="text-muted">(optional)</span></span>
              <input type="url" bind:value={seasonCeremonyUrl} placeholder="https://www.youtube.com/watch?v=..." />
              <p class="field-hint">Shown as an embedded player on the season's awards page. Leave blank to hide the ceremony section.</p>
            </label>
            <div class="admin-modal-form-actions admin-modal-form-actions-end">
              <button type="button" class="btn-admin btn-secondary" onclick={closeSeasonForm}>Cancel</button>
              <button type="button" class="btn-admin btn-primary" onclick={submitSeasonForm}>
                {seasonEditingYear ? "Save changes" : "Add season"}
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .admin-modal {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .admin-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(12, 16, 23, 0.6);
    backdrop-filter: blur(2px);
  }
  .admin-modal-panel {
    position: relative;
    width: min(640px, 92vw);
    max-height: 85vh;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .admin-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .admin-modal-header h3 { margin: 0; font-size: 1.1rem; }
  .admin-modal-close {
    appearance: none;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius-sm);
  }
  .admin-modal-close:hover {
    color: var(--text);
    background: var(--surface-hover);
    border-color: var(--border-subtle);
  }

  .admin-modal-tabs {
    display: flex;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border-subtle);
    gap: 0.25rem;
  }
  .admin-modal-tabs button {
    padding: 0.65rem 1rem;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .admin-modal-tabs button.is-active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .admin-modal-body {
    padding: 1rem 1.25rem 1.25rem;
    overflow-y: auto;
  }

  .admin-modal-panel-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .admin-modal-panel-header h4 { margin: 0; font-size: 0.95rem; font-weight: 700; }
  .admin-modal-panel-header .field-hint { margin: 0.15rem 0 0; font-size: 0.78rem; color: var(--text-muted); }

  .admin-modal-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .admin-modal-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 0.9rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  .admin-modal-form {
    padding: 1.15rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 1.05rem;
    margin-top: 1rem;
  }
  .admin-modal-form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -0.15rem 0 0.35rem;
  }
  .admin-modal-form-header h5 {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .form-field > span {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .form-field input, .form-field select {
    padding: 0.55rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 0.95rem;
  }
  .form-field input:focus, .form-field select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.15);
  }
  .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
  .field-hint { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--text-muted); }
  .required { color: #ff8a8a; margin-left: 0.15rem; font-weight: 600; }
  .text-muted { color: var(--text-muted); }

  .admin-modal-form-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    margin-top: 0.5rem;
    flex-wrap: nowrap;
    min-height: 3rem;
  }
  .admin-modal-form-actions-end { justify-content: flex-end; }

  .btn-admin {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    height: 2.5rem;
    min-width: 6.5rem;
    width: auto;
    margin: 0;
    padding: 0 1.15rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-weight: 600;
    font-size: 0.9rem;
    line-height: 1;
    text-align: center;
    cursor: pointer;
    white-space: nowrap;
    vertical-align: middle;
    flex: 0 0 auto;
  }
  /* Secondary and primary must render at IDENTICAL box height. Both declare
     border: 1px solid; the color varies but the geometry is the same. */
  .btn-admin.btn-secondary { border-color: var(--border); }
  .btn-admin.btn-primary { border-color: transparent; }
  .btn-small { height: 2.1rem; min-width: 0; padding: 0 0.9rem; font-size: 0.82rem; }
  .btn-primary { background: var(--accent); color: #0c1017; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: wait; }
  .btn-secondary { background: transparent; border-color: var(--border); color: var(--text-muted); }
  .btn-secondary:hover { color: var(--text); background: var(--surface-hover); }

</style>

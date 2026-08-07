<script lang="ts">
  // Admin app — player-first surface.
  //
  //   [player list]  ── click ──>  [drawer with profile + slam counts + actions]
  //
  // Firestore realtime listeners keep the list in sync automatically. Writes
  // go straight to Firestore via firestore-writes.ts helpers; there's no
  // "save changes" queue anymore because Firestore's client SDK applies
  // mutations optimistically before the network round-trip.
  //
  // The old Hugo drawer had a "drawerPending" batch model — that whole
  // dance goes away here.

  import { onMount, onDestroy } from "svelte";
  import { collection, onSnapshot, query, where } from "firebase/firestore";
  import { getDb } from "@/lib/firebase";
  import { watchAuth, signOut, type AuthState } from "@/lib/auth";
  import { resolveCurrentSeason, buildSeasonLeaderboard, type LeaderboardRow } from "@/lib/firestore-reads";
  import {
    bulkAddSlams,
    bulkRemoveAggregateSlams,
    updatePlayer,
    deactivatePlayer,
  } from "@/lib/firestore-writes";
  import type { Player, Club, Slam, Season } from "@/lib/firestore-schema";
  import ManageModal from "./ManageModal.svelte";

  let authState: AuthState = $state({ status: "loading", user: null, admin: null });

  let players: Player[] = $state([]);
  let clubs: Club[] = $state([]);
  let slams: Slam[] = $state([]);
  let seasons: Season[] = $state([]);
  let currentSeasonYear: number | null = $state(null);
  let activeSeasonYear: number | null = $state(null);
  let selectedPlayerId: string | null = $state(null);
  let manageOpen = $state(false);
  let searchQuery = $state("");

  // Pending slam deltas — accumulate locally, flushed on Save changes.
  // Positive means "add this many," negative means "remove this many."
  let pendingWhite = $state(0);
  let pendingBlack = $state(0);
  let saving = $state(false);

  // Activity feed shown in the bell dropdown. Newest first, capped at 20.
  interface ActivityEntry {
    id: number;
    at: string;              // display timestamp e.g. "just now"
    kind: "success" | "error" | "pending";
    text: string;
  }
  let activity: ActivityEntry[] = $state([]);
  let activityOpen = $state(false);
  let nextActivityId = 1;

  function logActivity(kind: ActivityEntry["kind"], text: string): void {
    activity = [
      { id: nextActivityId++, at: formatTime(new Date()), kind, text },
      ...activity,
    ].slice(0, 20);
  }
  function formatTime(d: Date): string {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function clearActivity() { activity = []; }

  // Close the bell dropdown when the user clicks anywhere outside the bell
  // (including the panel itself's ancestor .bell-wrap) or presses Escape.
  function handleDocumentClick(e: MouseEvent) {
    if (!activityOpen) return;
    const target = e.target as Element | null;
    if (target && target.closest(".bell-wrap")) return; // click inside — leave open
    activityOpen = false;
  }
  function handleDocumentKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && activityOpen) activityOpen = false;
  }

  // ── Firestore listeners ──────────────────────────────────────────
  const unsubscribers: (() => void)[] = [];

  onMount(() => {
    unsubscribers.push(watchAuth((s) => { authState = s; }));

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    unsubscribers.push(() => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleDocumentKeydown);
    });

    const db = getDb();
    unsubscribers.push(
      onSnapshot(collection(db, "players"), (snap) => {
        players = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Player, "id">) }))
          .filter((p) => p.active !== false);
      })
    );
    unsubscribers.push(
      onSnapshot(collection(db, "clubs"), (snap) => {
        clubs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Club, "id">) }));
      })
    );
    unsubscribers.push(
      onSnapshot(query(collection(db, "slams"), where("active", "==", true)), (snap) => {
        slams = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Slam, "id">) }));
      })
    );
    unsubscribers.push(
      onSnapshot(collection(db, "seasons"), (snap) => {
        seasons = snap.docs
          .map((d) => d.data() as Season)
          .filter((s) => s.available !== false)
          .sort((a, b) => a.year - b.year);
        currentSeasonYear = resolveCurrentSeason(seasons);
        if (!activeSeasonYear) {
          const url = new URLSearchParams(location.search).get("season");
          activeSeasonYear = url ? parseInt(url, 10) : currentSeasonYear;
        }
      })
    );
  });

  onDestroy(() => {
    for (const un of unsubscribers) un();
  });

  // ── Derived views ────────────────────────────────────────────────

  let leaderboard = $derived.by(() => {
    if (!activeSeasonYear) return [];
    const seasonSlams = slams.filter((s) => s.season === activeSeasonYear);
    return buildSeasonLeaderboard(players, clubs, seasonSlams);
  });

  let filteredList = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return leaderboard;
    return leaderboard.filter((r) => {
      const hay = [r.player.name, ...(r.player.aliases ?? []), r.player.id, ...r.clubs.map((c) => c.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  });

  let selectedPlayer = $derived(players.find((p) => p.id === selectedPlayerId) ?? null);
  let selectedRow = $derived(leaderboard.find((r) => r.player.id === selectedPlayerId) ?? null);
  let seasonLabelFor = $derived((y: number | null) => seasons.find((s) => s.year === y)?.label ?? String(y ?? ""));

  // ── Actions ──────────────────────────────────────────────────────
  // Slam +/− actions accumulate in local `pendingWhite`/`pendingBlack` state.
  // No Firestore write happens until the user clicks "Save changes".

  function bumpSlam(type: "white" | "black", delta: number) {
    if (type === "white") pendingWhite += delta;
    else pendingBlack += delta;
  }

  // Effective displayed counts = stored + pending delta.
  let displayedWhite = $derived((selectedRow?.stats.white ?? 0) + pendingWhite);
  let displayedBlack = $derived((selectedRow?.stats.black ?? 0) + pendingBlack);

  // ── Profile-edit drawer state ────────────────────────────────────
  // These bind to the drawer inputs. Kept separate from the source-of-truth
  // player doc so a partially-edited form doesn't leak into the list.
  let draftName = $state("");
  let draftGender = $state<"male" | "female">("male");
  let draftAliases = $state("");
  let draftClubIds: string[] = $state([]);

  $effect(() => {
    if (!selectedPlayer) return;
    draftName = selectedPlayer.name ?? "";
    draftGender = (selectedPlayer.gender ?? "male") as "male" | "female";
    draftAliases = (selectedPlayer.aliases ?? []).join(", ");
    draftClubIds = [...(selectedPlayer.clubIds ?? [])];
    // Reset pending slam deltas whenever the selected player changes.
    pendingWhite = 0;
    pendingBlack = 0;
  });

  function buildProfilePatch(): Partial<Player> | null {
    if (!selectedPlayer) return null;
    const aliases = draftAliases.split(",").map((a) => a.trim()).filter(Boolean);
    const patch: Partial<Player> = {};
    if (draftName !== selectedPlayer.name) patch.name = draftName;
    if (draftGender !== selectedPlayer.gender) patch.gender = draftGender;
    if (aliases.join(",") !== (selectedPlayer.aliases ?? []).join(",")) patch.aliases = aliases;
    if (draftClubIds.slice().sort().join(",") !== (selectedPlayer.clubIds ?? []).slice().sort().join(",")) {
      patch.clubIds = draftClubIds;
    }
    return Object.keys(patch).length === 0 ? null : patch;
  }

  let hasPendingChanges = $derived(
    pendingWhite !== 0 || pendingBlack !== 0 || buildProfilePatch() !== null
  );

  async function saveChanges() {
    if (!selectedPlayer || !selectedPlayerId || !activeSeasonYear) return;
    const patch = buildProfilePatch();
    const whiteDelta = pendingWhite;
    const blackDelta = pendingBlack;
    if (!patch && whiteDelta === 0 && blackDelta === 0) {
      logActivity("success", "No changes to save.");
      return;
    }

    const player = selectedPlayer;
    const pid = selectedPlayerId;
    const season = activeSeasonYear;
    const clubId = (player.clubIds ?? [])[0] ?? null;

    // Close the drawer immediately on Save so the user doesn't see the
    // intermediate frame between "we've written the slam" and "onSnapshot
    // has updated stats.white" — without this the count briefly reverts
    // (e.g. was 1 + pending 1 = 2, then 1 + 0 = 1, then Firestore = 2).
    saving = true;
    logActivity("pending", `Saving ${player.name}…`);
    selectedPlayerId = null;
    pendingWhite = 0;
    pendingBlack = 0;

    try {
      if (patch) {
        await updatePlayer(player.id, { ...player }, patch);
        logActivity("success", `${player.name} profile updated.`);
      }
      for (const [type, delta] of [["white", whiteDelta], ["black", blackDelta]] as const) {
        if (delta > 0) {
          await bulkAddSlams({ playerId: pid, season, type, count: delta, clubId });
          logActivity("success", `+${delta} ${type} for ${player.name}.`);
        } else if (delta < 0) {
          await bulkRemoveAggregateSlams({ playerId: pid, season, type, count: -delta });
          logActivity("success", `${delta} ${type} for ${player.name}.`);
        }
      }
    } catch (e) {
      logActivity("error", `${player.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      saving = false;
    }
  }

  function cancelDrawer() {
    // Reset pending deltas as we close the drawer without saving.
    pendingWhite = 0;
    pendingBlack = 0;
    selectedPlayerId = null;
  }

  async function doDeactivate() {
    if (!selectedPlayer) return;
    if (!confirm(`Deactivate ${selectedPlayer.name}? They'll disappear from the public leaderboard.`)) return;
    logActivity("pending", `Deactivating ${selectedPlayer.name}…`);
    try {
      await deactivatePlayer(selectedPlayer.id);
      const name = selectedPlayer.name;
      selectedPlayerId = null;
      pendingWhite = 0;
      pendingBlack = 0;
      logActivity("success", `${name} deactivated.`);
    } catch (e) {
      logActivity("error", e instanceof Error ? e.message : String(e));
    }
  }

  function toggleClub(clubId: string) {
    if (draftClubIds.includes(clubId)) {
      draftClubIds = draftClubIds.filter((c) => c !== clubId);
    } else {
      draftClubIds = [...draftClubIds, clubId];
    }
  }
</script>

<div class="admin-app">
  <!-- Topbar: user pill + season badge + stats on the left; Manage + Sign out on the right. -->
  <div class="admin-topbar">
    <div class="admin-topbar-left">
      {#if authState.user}
        <span class="admin-user-pill">
          <span class="admin-user-avatar" aria-hidden="true">
            {(authState.user.email ?? "?").charAt(0).toUpperCase()}
          </span>
          <span class="admin-user-email">{authState.user.email}</span>
          {#if authState.admin?.role === "owner"}
            <span class="admin-user-role">owner</span>
          {/if}
        </span>
      {/if}
      <span class="admin-season-pill" title="Active season">
        <span class="admin-season-icon" aria-hidden="true">◷</span>
        {seasonLabelFor(activeSeasonYear)}
        {#if activeSeasonYear === currentSeasonYear} · current{/if}
      </span>
      <span class="admin-stats">
        {players.length} players · {clubs.filter((c) => c.active !== false).length} clubs ·
        {slams.filter((s) => s.season === activeSeasonYear).length} slams this season
      </span>
    </div>
    <div class="admin-topbar-right">
      <div class="bell-wrap">
        <button
          type="button"
          class="btn-bell"
          class:has-activity={activity.length > 0}
          onclick={() => (activityOpen = !activityOpen)}
          aria-label="Recent activity"
          aria-haspopup="true"
          aria-expanded={activityOpen}
        >
          <span aria-hidden="true">🔔</span>
          {#if activity.length > 0}
            <span class="bell-count">{activity.length}</span>
          {/if}
        </button>
        {#if activityOpen}
          <div class="bell-panel" role="menu" aria-label="Recent activity">
            <div class="bell-panel-head">
              <strong>Recent activity</strong>
              {#if activity.length > 0}
                <button type="button" class="bell-clear" onclick={clearActivity}>Clear</button>
              {/if}
            </div>
            {#if activity.length === 0}
              <p class="bell-empty">No activity yet.</p>
            {:else}
              <ul class="bell-list">
                {#each activity as a (a.id)}
                  <li class="bell-item bell-item-{a.kind}">
                    <span class="bell-item-icon" aria-hidden="true">
                      {a.kind === "success" ? "✓" : a.kind === "error" ? "✕" : "⋯"}
                    </span>
                    <span class="bell-item-text">{a.text}</span>
                    <span class="bell-item-time">{a.at}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </div>
      <button type="button" class="btn-manage" onclick={() => (manageOpen = true)}>Manage</button>
      <button type="button" class="btn-signout" onclick={() => signOut()}>Sign out</button>
    </div>
  </div>

  <!-- Player list -->
  <div class="admin-list-wrap">
    <div class="admin-list-header">
      <input
        type="search"
        class="admin-player-search"
        placeholder="Search players by name, alias, or club…"
        bind:value={searchQuery}
        autocomplete="off"
      />
      <span class="admin-list-count">{filteredList.length} player{filteredList.length === 1 ? "" : "s"}</span>
    </div>
    <div class="admin-list-table-wrap">
      <table class="admin-list-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Club</th>
            <th scope="col" class="num">W</th>
            <th scope="col" class="num">B</th>
            <th scope="col" class="num">Total</th>
            <th scope="col" aria-label="Open drawer"></th>
          </tr>
        </thead>
        <tbody>
          {#each filteredList as row, i (row.player.id)}
            <tr>
              <td class="admin-list-rank">{i + 1}</td>
              <td class="admin-list-player">
                <strong>{row.player.name}</strong>
                {#if row.player.aliases && row.player.aliases.length}
                  <span class="admin-list-alias">{row.player.aliases.join(", ")}</span>
                {/if}
              </td>
              <td class="admin-list-club">{row.clubs.map((c) => c.name).join(", ") || "—"}</td>
              <td class="num">{row.stats.white}</td>
              <td class="num">{row.stats.black}</td>
              <td class="num"><strong>{row.stats.total}</strong></td>
              <td class="admin-list-open">
                <button
                  type="button"
                  class="btn-open"
                  aria-label="Open {row.player.name}"
                  onclick={() => (selectedPlayerId = row.player.id)}
                >›</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if filteredList.length === 0}
        <p class="admin-list-empty">No players match this search.</p>
      {/if}
    </div>
  </div>
</div>

<!-- Drawer -->
{#if selectedPlayer && selectedRow}
  <aside class="admin-drawer" aria-hidden="false">
    <div class="admin-drawer-backdrop" onclick={() => (selectedPlayerId = null)} role="presentation"></div>
    <div class="admin-drawer-panel" role="dialog" aria-labelledby="drawer-title">
      <header class="admin-drawer-header">
        <div class="admin-drawer-identity">
          <span class="admin-drawer-avatar" aria-hidden="true" data-gender={selectedPlayer.gender}>
            {(selectedPlayer.name.split(/\s+/)[0]?.[0] ?? "?").toUpperCase()}{(selectedPlayer.name.split(/\s+/).at(-1)?.[0] ?? "").toUpperCase()}
          </span>
          <div class="admin-drawer-identity-text">
            <p class="admin-drawer-eyebrow">Edit player</p>
            <h3 id="drawer-title" class="admin-drawer-title">{selectedPlayer.name}</h3>
            <p class="admin-drawer-id">{selectedPlayer.id}</p>
          </div>
        </div>
        <button type="button" class="admin-modal-close" onclick={() => (selectedPlayerId = null)} aria-label="Close">✕</button>
      </header>

      <div class="admin-drawer-body">
        <section class="admin-drawer-section">
          <h4 class="admin-drawer-section-title">Profile</h4>
          <div class="admin-drawer-form">
            <label class="form-field">
              <span>Full name</span>
              <input type="text" bind:value={draftName} autocomplete="off" />
            </label>
            <div class="form-row form-row-2">
              <label class="form-field">
                <span>Gender</span>
                <select bind:value={draftGender}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label class="form-field">
                <span>Aliases</span>
                <input type="text" bind:value={draftAliases} placeholder="Comma-separated" autocomplete="off" />
              </label>
            </div>
            <div class="form-field">
              <span>Clubs</span>
              <div class="club-picker" role="group" aria-label="Clubs">
                {#each clubs.filter((c) => c.active !== false) as c (c.id)}
                  {@const on = draftClubIds.includes(c.id)}
                  <button
                    type="button"
                    class="club-picker-row"
                    class:is-on={on}
                    aria-pressed={on}
                    onclick={() => toggleClub(c.id)}
                  >
                    <span class="club-picker-check" aria-hidden="true">{on ? "✓" : ""}</span>
                    <span class="club-picker-name">{c.name}</span>
                  </button>
                {/each}
              </div>
              <p class="field-hint">Tap a row to toggle membership.</p>
            </div>
          </div>
        </section>

        <section class="admin-drawer-section">
          <div class="admin-drawer-section-header">
            <h4 class="admin-drawer-section-title">Slams</h4>
            <span class="admin-drawer-section-sub">{seasonLabelFor(activeSeasonYear)}</span>
          </div>
          <div class="drawer-slam-counts">
            <article class="drawer-slam-count drawer-slam-count-white">
              <header class="drawer-slam-count-head">
                <span class="drawer-slam-count-dot" aria-hidden="true">○</span>
                <span class="drawer-slam-count-label">White</span>
              </header>
              <div class="drawer-slam-count-value">
                {displayedWhite}
                {#if pendingWhite !== 0}
                  <span class="drawer-slam-count-delta">{pendingWhite > 0 ? `+${pendingWhite}` : pendingWhite}</span>
                {/if}
              </div>
              <div class="drawer-slam-count-actions">
                <button type="button" class="drawer-slam-btn drawer-slam-btn-minus" onclick={() => bumpSlam("white", -1)} aria-label="Remove one white" disabled={displayedWhite <= 0}>−</button>
                <button type="button" class="drawer-slam-btn drawer-slam-btn-plus" onclick={() => bumpSlam("white", 1)} aria-label="Add one white">+</button>
                <button type="button" class="drawer-slam-btn-5" onclick={() => bumpSlam("white", 5)} aria-label="Add five white">+5</button>
              </div>
            </article>
            <article class="drawer-slam-count drawer-slam-count-black">
              <header class="drawer-slam-count-head">
                <span class="drawer-slam-count-dot" aria-hidden="true">●</span>
                <span class="drawer-slam-count-label">Black</span>
              </header>
              <div class="drawer-slam-count-value">
                {displayedBlack}
                {#if pendingBlack !== 0}
                  <span class="drawer-slam-count-delta">{pendingBlack > 0 ? `+${pendingBlack}` : pendingBlack}</span>
                {/if}
              </div>
              <div class="drawer-slam-count-actions">
                <button type="button" class="drawer-slam-btn drawer-slam-btn-minus" onclick={() => bumpSlam("black", -1)} aria-label="Remove one black" disabled={displayedBlack <= 0}>−</button>
                <button type="button" class="drawer-slam-btn drawer-slam-btn-plus" onclick={() => bumpSlam("black", 1)} aria-label="Add one black">+</button>
                <button type="button" class="drawer-slam-btn-5" onclick={() => bumpSlam("black", 5)} aria-label="Add five black">+5</button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <footer class="admin-drawer-footer">
        <button type="button" class="btn-admin btn-danger" onclick={doDeactivate}>Deactivate</button>
        <button type="button" class="btn-admin btn-secondary" onclick={cancelDrawer}>Cancel</button>
        <button type="button" class="btn-admin btn-primary" onclick={saveChanges} disabled={!hasPendingChanges}>Save changes</button>
      </footer>
    </div>
  </aside>
{/if}

<!-- Manage modal -->
{#if manageOpen}
  <ManageModal
    onClose={() => (manageOpen = false)}
    clubs={clubs}
    seasons={seasons}
    onActivity={logActivity}
  />
{/if}

<style>
  .admin-app {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .admin-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    background:
      radial-gradient(circle at 0% 50%, rgba(74, 158, 255, 0.08), transparent 40%),
      radial-gradient(circle at 100% 50%, rgba(167, 139, 250, 0.05), transparent 40%),
      var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
    flex-wrap: wrap;
  }
  .admin-topbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
    flex-wrap: wrap;
  }
  .admin-user-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.28rem 0.7rem 0.28rem 0.3rem;
    background: linear-gradient(135deg, rgba(74, 158, 255, 0.14), rgba(74, 158, 255, 0.04));
    border: 1px solid rgba(74, 158, 255, 0.35);
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
  }
  .admin-user-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.55rem;
    height: 1.55rem;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), #6b8fff);
    color: #0c1017;
    font-weight: 800;
    font-size: 0.78rem;
  }
  .admin-user-email {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .admin-user-role {
    padding: 0.08rem 0.4rem;
    border-radius: 999px;
    background: rgba(232, 197, 71, 0.14);
    border: 1px solid rgba(232, 197, 71, 0.4);
    color: var(--gold);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .btn-signout {
    appearance: none;
    height: 2.3rem;
    padding: 0 0.95rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-signout:hover { background: var(--surface-hover); color: var(--text); }
  .admin-season-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(232, 197, 71, 0.1);
    border: 1px solid rgba(232, 197, 71, 0.32);
    color: var(--gold);
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .admin-season-icon { font-size: 0.85rem; }
  .admin-stats {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .admin-topbar-right { display: flex; gap: 0.5rem; flex-shrink: 0; }
  .btn-manage {
    height: 2.3rem;
    padding: 0 1rem;
    background: var(--accent);
    color: #0c1017;
    border: 0;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-manage:hover { background: var(--accent-hover); }

  /* Player list */
  .admin-list-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .admin-list-header {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .admin-player-search {
    flex: 1;
    padding: 0.55rem 0.85rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 0.95rem;
  }
  .admin-player-search:focus {
    outline: none;
    border-color: var(--accent);
  }
  .admin-list-count {
    font-size: 0.85rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .admin-list-table-wrap {
    max-height: 640px;
    overflow-y: auto;
  }
  .admin-list-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .admin-list-table thead th {
    position: sticky;
    top: 0;
    background: var(--bg-elevated);
    padding: 0.75rem 0.85rem;
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
    border-bottom: 1px solid var(--border);
    z-index: 1;
  }
  .admin-list-table th.num, .admin-list-table td.num { text-align: right; }
  .admin-list-table tbody td {
    padding: 0.55rem 0.85rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .admin-list-table tbody tr:hover { background: var(--surface-hover); }
  .admin-list-rank { color: var(--text-muted); font-weight: 600; width: 3ch; }
  .admin-list-player strong { display: block; }
  .admin-list-alias { display: block; font-size: 0.75rem; color: var(--text-muted); }
  .admin-list-club { color: var(--text-muted); }
  .admin-list-open { width: 40px; text-align: right; }
  .btn-open {
    height: 1.9rem;
    padding: 0 0.6rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .btn-open:hover { border-color: var(--accent); color: var(--accent); }
  .admin-list-empty { padding: 2rem; text-align: center; color: var(--text-muted); }

  /* Drawer */
  .admin-drawer {
    position: fixed;
    inset: 0;
    z-index: 200;
  }
  .admin-drawer-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(12, 16, 23, 0.55);
    backdrop-filter: blur(2px);
  }
  .admin-drawer-panel {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    width: min(520px, 92vw);
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: drawerSlide 0.2s ease-out;
  }
  @keyframes drawerSlide {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .admin-drawer-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 1.15rem 1.35rem;
    border-bottom: 1px solid var(--border);
    gap: 1rem;
  }
  .admin-drawer-identity {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }
  .admin-drawer-avatar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.85rem;
    height: 2.85rem;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--accent), #6b8fff);
    color: #0c1017;
    font-weight: 800;
    font-size: 1.05rem;
    box-shadow: 0 3px 10px rgba(74, 158, 255, 0.28);
  }
  .admin-drawer-avatar[data-gender="female"] {
    background: linear-gradient(135deg, #f7a3c4, #c47ce8);
  }
  .admin-drawer-eyebrow {
    margin: 0;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
  }
  .admin-drawer-title { margin: 0.1rem 0 0; font-size: 1.25rem; font-weight: 700; }
  .admin-drawer-id { margin: 0.2rem 0 0; font-size: 0.72rem; color: var(--text-muted); font-family: ui-monospace, "SF Mono", monospace; }

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

  .admin-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.35rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .admin-drawer-section-title {
    margin: 0 0 0.85rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 700;
  }
  .admin-drawer-section-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.85rem;
  }
  .admin-drawer-section-header .admin-drawer-section-title { margin: 0; }
  .admin-drawer-section-sub { font-size: 0.78rem; color: var(--text-muted); }

  .admin-drawer-form { display: flex; flex-direction: column; gap: 1rem; }
  .admin-drawer-form .form-field { display: flex; flex-direction: column; gap: 0.35rem; }
  .admin-drawer-form .form-field span { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
  .admin-drawer-form input, .admin-drawer-form select {
    padding: 0.55rem 0.75rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 0.95rem;
  }
  .admin-drawer-form input:focus, .admin-drawer-form select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.15);
  }
  .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .field-hint { margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--text-muted); }

  /* Multi-select list styled like a rows-of-checkboxes control.
     Rows stack for narrow drawers; on wider viewports the list stays vertical
     since it typically holds 2-4 clubs — dense enough that a horizontal
     wrap would look busy. */
  .club-picker {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.35rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    max-height: 12rem;
    overflow-y: auto;
  }
  .club-picker-row {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .club-picker-row:hover {
    background: var(--surface-hover);
  }
  .club-picker-row.is-on {
    background: rgba(74, 158, 255, 0.12);
    border-color: rgba(74, 158, 255, 0.55);
  }
  .club-picker-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: transparent;
    font-size: 0.8rem;
    font-weight: 800;
    flex-shrink: 0;
  }
  .club-picker-row.is-on .club-picker-check {
    color: #0c1017;
    background: var(--accent);
    border-color: var(--accent);
  }
  .club-picker-name { flex: 1; }

  /* Slam count cards */
  .drawer-slam-counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;
  }
  .drawer-slam-count {
    padding: 1.1rem 1.15rem 1rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.85rem;
    position: relative;
    overflow: hidden;
  }
  .drawer-slam-count::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
  }
  .drawer-slam-count-white::before { background: var(--white-slam); }
  .drawer-slam-count-black::before { background: #c9a227; }
  .drawer-slam-count-head { display: flex; align-items: center; gap: 0.45rem; }
  .drawer-slam-count-white .drawer-slam-count-dot { color: var(--white-slam); }
  .drawer-slam-count-black .drawer-slam-count-dot { color: #c9a227; }
  .drawer-slam-count-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; }
  .drawer-slam-count-value {
    font-size: 2.4rem;
    font-weight: 800;
    color: var(--text);
    line-height: 1;
  }
  .drawer-slam-count-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4rem; width: 100%; }
  .drawer-slam-btn, .drawer-slam-btn-5 {
    appearance: none;
    height: 2.25rem;
    padding: 0;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-family: inherit;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .drawer-slam-btn-plus {
    background: rgba(74, 158, 255, 0.14);
    border-color: rgba(74, 158, 255, 0.4);
    color: var(--accent);
    font-size: 1.15rem;
  }
  .drawer-slam-btn-plus:hover { background: rgba(74, 158, 255, 0.24); }
  .drawer-slam-btn-minus {
    background: rgba(239, 68, 68, 0.08);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.32);
    font-size: 1.3rem;
  }
  .drawer-slam-btn-minus:hover { background: rgba(239, 68, 68, 0.18); }
  .drawer-slam-btn-5 { font-size: 0.85rem; color: var(--text-muted); }

  /* Drawer footer */
  .admin-drawer-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.35rem;
    border-top: 1px solid var(--border);
    background: var(--surface);
    flex-wrap: nowrap;
    min-height: 4rem;
  }
  .btn-admin {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    height: 2.4rem;
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
  /* Force identical box geometry across variants — border colors vary,
     border widths do not. */
  .btn-admin.btn-secondary { border-color: var(--border); }
  .btn-admin.btn-primary { border-color: transparent; }
  .btn-admin.btn-danger { border-color: rgba(239, 68, 68, 0.35); }
  .btn-primary { background: var(--accent); color: #0c1017; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: transparent; border-color: var(--border); color: var(--text-muted); }
  .btn-secondary:hover { color: var(--text); background: var(--surface-hover); }
  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.35);
    margin-right: auto;
  }
  .btn-danger:hover { background: rgba(239, 68, 68, 0.25); }

  /* Activity bell — replaces the earlier toast overlay. Sits in the admin
     topbar; clicking opens a dropdown of recent write activity. */
  .bell-wrap { position: relative; display: inline-block; }
  .btn-bell {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    height: 2.3rem;
    min-width: 2.5rem;
    padding: 0 0.7rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    position: relative;
  }
  .btn-bell:hover { background: var(--surface-hover); }
  .btn-bell.has-activity { border-color: rgba(74, 158, 255, 0.4); }
  .bell-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 0.35rem;
    background: var(--accent);
    color: #0c1017;
    font-weight: 800;
    font-size: 0.7rem;
    line-height: 1;
    border-radius: 999px;
  }

  .bell-panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: 22rem;
    max-height: 24rem;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    z-index: 260;
    padding: 0.35rem;
  }
  .bell-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .bell-clear {
    appearance: none;
    background: transparent;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.82rem;
    padding: 0;
  }
  .bell-empty {
    margin: 0;
    padding: 1.35rem 0.75rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .bell-list {
    list-style: none;
    margin: 0;
    padding: 0.35rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .bell-item {
    display: grid;
    grid-template-columns: 1.15rem 1fr auto;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.88rem;
    color: var(--text);
  }
  .bell-item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 999px;
    font-weight: 800;
    font-size: 0.72rem;
  }
  .bell-item-success .bell-item-icon { background: rgba(52, 211, 153, 0.18); color: #6ee7b7; }
  .bell-item-error .bell-item-icon { background: rgba(239, 68, 68, 0.18); color: #fca5a5; }
  .bell-item-pending .bell-item-icon { background: rgba(74, 158, 255, 0.18); color: #93c5fd; }
  .bell-item-text { overflow: hidden; text-overflow: ellipsis; }
  .bell-item-time { color: var(--text-muted); font-size: 0.78rem; }

  /* Pending delta chip shown next to the effective slam count while unsaved */
  .drawer-slam-count-delta {
    display: inline-block;
    margin-left: 0.35rem;
    padding: 0.1rem 0.5rem;
    background: rgba(74, 158, 255, 0.18);
    color: var(--accent);
    border: 1px solid rgba(74, 158, 255, 0.4);
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    vertical-align: middle;
  }
  .btn-admin.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .drawer-slam-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>

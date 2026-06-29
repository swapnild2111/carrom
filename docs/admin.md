# Admin panel guide

The admin panel at [`/admin/`](https://swapnild2111.github.io/carrom/admin/) lets allowlisted GitHub users add and edit Thane district carrom data without touching JSON by hand. Every submission opens a GitHub issue; a GitHub Action validates the change, commits to `main`, and redeploys the site.

---

## Before you start

### Who can submit

Only GitHub usernames listed in [`data/admin-allowlist.json`](https://github.com/swapnild2111/carrom/blob/main/data/admin-allowlist.json) can submit. Unauthorized issue authors are closed automatically.

### Sign in

1. Open **Admin** from the site nav or go to `/admin/`.
2. Create a [fine-grained personal access token](https://github.com/settings/tokens?type=beta):
   - Repository: **only** `swapnild2111/carrom`
   - Permission: **Issues → Read and write**
3. Paste the token and click **Sign in with GitHub**.

The token is stored in your browser session only and is sent directly to GitHub — never to any other server.

### How submissions work

```text
Fill form → GitHub issue created → Action runs script → validate + build → commit → deploy
```

You’ll see a toast with the issue number. The site updates within a few minutes after the workflow finishes.

---

## Tabs overview

| Tab | Label | Issue label | What it does |
|-----|-------|-------------|--------------|
| **Add player** | `add-player` | Register a new Thane player |
| **Edit player** | `edit-player` | Update name, aliases, gender, clubs, or deactivate |
| **Add club** | `add-club` | Register a new club |
| **Add slam** | `add-slam` | Log a white or black slam for a player |
| **Edit slam** | `edit-slam` | Update slam fields or soft-delete |

---

## Add player

Register a new player for the current season (Thane district only).

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| **Full legal name** | Yes | Display name on profiles and leaderboard |
| **Gender** | Yes | Male or Female |
| **Aliases** | No | Comma-separated nicknames (search uses these) |
| **Clubs** | No | Multi-select; hold Ctrl/Cmd to pick several |

### Profile URL (player ID)

On first registration, the **player ID** is generated from the name (e.g. `Kunal Raut` → `kunal-raut`). That ID is permanent and used in slam records.

Use **Filter clubs…** above the club list when many clubs exist.

### After submit

Issue title: `[Player] {name}` · label `add-player`

---

## Edit player

Change an existing profile or remove someone from the active leaderboard.

### Find player

1. Use **Search** to filter by name, alias, or player ID.
2. Click a row in the picker list.
3. Review the preview card (gender, aliases, clubs, status).

### Actions

#### Update profile

| Field | Required | Notes |
|-------|----------|-------|
| **Full name** | Yes | Display name only — **player ID / URL does not change** |
| **Gender** | Yes | Male or Female |
| **Aliases** | No | Comma-separated; clear the field to remove all aliases |
| **Clubs** | No | Full replacement of club links; clear all to unlink every club |

#### Deactivate player

Soft-removes the player from leaderboard totals. Slam history is kept. Use when someone leaves the district roster.

### Important

- Renaming **does not** change the profile URL (`/players/kunal-raut/` stays the same).
- To fix a wrong slug, open a maintainer issue — that needs a data migration.

Issue title: `[Edit player] {name}` · label `edit-player`

---

## Add club

Create a club that can be linked to players and club-sourced slams.

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| **Club name** | Yes | Slug preview shown below (e.g. `Sai Carrom` → `sai-carrom`) |
| **Contact** | No | Free text |
| **Notes** | No | Internal note |

Issue title: `[Club] {name}` · label `add-club`

---

## Add slam

Record one white or black slam for an existing player.

### Slam details

| Field | Required | Notes |
|-------|----------|-------|
| **Player** | Yes | Searchable dropdown; shows linked clubs in the label |
| **Type** | Yes | White or Black |
| **Source** | Yes | Club, YouTube, or Tournament |
| **Club** | If source = Club | Auto-suggests clubs linked to the selected player |

### Context (optional)

Date, location, tournament, video URL, match reference, notes.

### Tips

- Pick the **player** first — the club dropdown narrows to their affiliated clubs when possible.
- If the player has exactly one club, it may be auto-selected.

Issue title: `[Slam] {player} — {type}` · label `add-slam`

---

## Edit slam

Find a slam, review it, then update fields or soft-delete it.

### Find slam

| Filter | Purpose |
|--------|---------|
| **Player** | Narrow to one player’s slams |
| **Type** | White or Black |
| **Search** | Slam ID, club, source, tournament, notes, etc. |

Click a row in the slam picker. The preview shows all current values.

### Actions

#### Update fields

Only fill fields you want to change. Empty selects mean “no change”.

| Field | Notes |
|-------|-------|
| Slam type | White or Black |
| Source | Club / YouTube / Tournament |
| Date | `YYYY-MM-DD` |
| Notes | Free text |

#### Delete (soft)

Marks the slam inactive. It disappears from leaderboard totals but remains in the database for audit.

Issue title: `[Edit slam] {slam-id}` · label `edit-slam`

---

## Dropdowns & search

Long lists (players, clubs) include a **Type to filter…** box above the select. Club multi-selects use **Filter clubs…** to hide non-matching options.

---

## GitHub issue format (manual)

Forms and the admin UI produce issues in this markdown shape (scripts parse `### Label` headings):

```markdown
### Full name

Kunal Raut

### Gender

Male
```

You can also use the issue templates under `.github/ISSUE_TEMPLATE/` if you prefer creating issues directly on GitHub.

| Workflow | Required labels |
|----------|-----------------|
| New player | `add-player` |
| Edit player | `edit-player` |
| New club | `add-club` |
| New slam | `add-slam` |
| Edit slam | `edit-slam` |

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Access denied | Your GitHub username is in `admin-allowlist.json` |
| Issue created but no deploy | Actions tab — workflow must finish; deploy is triggered after commit |
| Validation failed | Issue comment from the bot — usually unknown player/club ID or invalid date |
| Player not in slam dropdown | Player must exist in `players.json` (add them first) |
| Club required for slam | Source must be **Club** and a club selected |

---

## Related docs

- [README](../README.md) — project overview and local dev
- [Testing](testing.md) — automated test pack for all admin workflows
- [Data model](../README.md#data-model) — `players.json`, `clubs.json`, `slams.json`

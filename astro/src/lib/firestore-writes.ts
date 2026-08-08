// Firestore mutation helpers — every write stamps createdBy/updatedBy/*At
// from the currently-signed-in user and writes an audit_log entry.
//
// Security rules enforce that createdBy == request.auth.uid and
// updatedAt == request.time. If a caller tries to spoof either field the
// write fails; that's why we always overwrite them here.
//
// All writes go through Firestore SDK — no server round-trip, no PR queue.
// A signed-in admin sees changes reflected in the site's realtime listeners
// under 1 second.

import {
  doc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  writeBatch,
  type Firestore,
  type FieldValue,
} from "firebase/firestore";
import { getDb } from "./firebase";
import { getFbAuth } from "./auth";
import type { Player, Club, Slam, Season } from "./firestore-schema";

const COLLS = ["players", "clubs", "slams", "seasons"] as const;
type CollectionName = (typeof COLLS)[number];

// ── Actor helpers ────────────────────────────────────────────────

function requireAdmin(): { uid: string; email: string } {
  const user = getFbAuth().currentUser;
  if (!user) throw new Error("Not signed in.");
  return { uid: user.uid, email: user.email ?? "" };
}

function auditFieldsForCreate(actor: { uid: string; email: string }) {
  return {
    createdBy: actor.uid,
    createdByEmail: actor.email,
    createdAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedByEmail: actor.email,
    updatedAt: serverTimestamp(),
  };
}

function auditFieldsForUpdate(actor: { uid: string; email: string }): {
  updatedBy: string;
  updatedByEmail: string;
  updatedAt: FieldValue;
} {
  return {
    updatedBy: actor.uid,
    updatedByEmail: actor.email,
    updatedAt: serverTimestamp(),
  };
}

async function writeAuditLog(
  db: Firestore,
  actor: { uid: string; email: string },
  collectionName: CollectionName | "admins",
  docId: string,
  action: "create" | "update" | "delete",
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<void> {
  await addDoc(collection(db, "audit_log"), {
    collection: collectionName,
    docId,
    action,
    before,
    after,
    actorUid: actor.uid,
    actorEmail: actor.email,
    at: serverTimestamp(),
  });
}

// ── Slugify (port of scripts/lib.py::slugify) ────────────────────

export function slugify(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-\s]+/g, "-")
    .replace(/^-|-$/g, "")
    || "player";
}

// ── Player mutations ────────────────────────────────────────────

export async function createPlayer(input: {
  name: string;
  gender: "male" | "female";
  aliases?: string[];
  clubIds: string[];
}): Promise<string> {
  const actor = requireAdmin();
  const db = getDb();
  const id = slugify(input.name);
  const data = {
    name: input.name,
    gender: input.gender,
    aliases: input.aliases ?? [],
    clubIds: input.clubIds,
    district: "Thane",
    active: true,
    ...auditFieldsForCreate(actor),
  };
  await setDoc(doc(db, "players", id), data);
  await writeAuditLog(db, actor, "players", id, "create", null, { ...data });
  return id;
}

export async function updatePlayer(
  playerId: string,
  before: Partial<Player>,
  patch: Partial<Player>
): Promise<void> {
  const actor = requireAdmin();
  const db = getDb();
  const audit = auditFieldsForUpdate(actor);
  await updateDoc(doc(db, "players", playerId), { ...patch, ...audit });
  await writeAuditLog(db, actor, "players", playerId, "update", before, { ...patch, ...audit });
}

export async function deactivatePlayer(playerId: string): Promise<void> {
  return updatePlayer(playerId, { active: true }, { active: false });
}

// ── Club mutations ──────────────────────────────────────────────

export async function createClub(input: {
  name: string;
  contact?: string;
  notes?: string;
}): Promise<string> {
  const actor = requireAdmin();
  const db = getDb();
  const id = slugify(input.name);
  const data = {
    name: input.name,
    contact: input.contact ?? null,
    notes: input.notes ?? null,
    district: "Thane",
    active: true,
    ...auditFieldsForCreate(actor),
  };
  await setDoc(doc(db, "clubs", id), data);
  await writeAuditLog(db, actor, "clubs", id, "create", null, { ...data });
  return id;
}

export async function updateClub(
  clubId: string,
  before: Partial<Club>,
  patch: Partial<Club>
): Promise<void> {
  const actor = requireAdmin();
  const db = getDb();
  const audit = auditFieldsForUpdate(actor);
  await updateDoc(doc(db, "clubs", clubId), { ...patch, ...audit });
  await writeAuditLog(db, actor, "clubs", clubId, "update", before, { ...patch, ...audit });
}

// ── Season mutations ────────────────────────────────────────────

export async function createSeason(input: {
  year: number;
  label: string;
  start: string;
  end: string;
}): Promise<string> {
  const actor = requireAdmin();
  const db = getDb();
  const id = String(input.year);
  const data = {
    year: input.year,
    label: input.label,
    start: input.start,
    end: input.end,
    available: true,
    ...auditFieldsForCreate(actor),
  };
  await setDoc(doc(db, "seasons", id), data);
  await writeAuditLog(db, actor, "seasons", id, "create", null, { ...data });
  return id;
}

export async function updateSeason(
  year: number,
  before: Partial<Season>,
  patch: Partial<Season>
): Promise<void> {
  const actor = requireAdmin();
  const db = getDb();
  const id = String(year);
  const audit = auditFieldsForUpdate(actor);
  await updateDoc(doc(db, "seasons", id), { ...patch, ...audit });
  await writeAuditLog(db, actor, "seasons", id, "update", before, { ...patch, ...audit });
}

// ── Slam mutations ──────────────────────────────────────────────

/**
 * Allocate the next slam ID for a given season, e.g. slam-2024-0181.
 * Not race-safe (two rapid adds could collide) but rare in practice.
 */
async function nextSlamId(db: Firestore, seasonYear: number): Promise<string> {
  const { getDocs, query, where, collection: coll } = await import("firebase/firestore");
  const snap = await getDocs(query(coll(db, "slams"), where("season", "==", seasonYear)));
  let maxN = 0;
  const re = new RegExp(`^slam-${seasonYear}-(\\d+)$`);
  snap.forEach((docSnap) => {
    const match = docSnap.id.match(re);
    if (match) {
      const n = parseInt(match[1]!, 10);
      if (n > maxN) maxN = n;
    }
  });
  return `slam-${seasonYear}-${String(maxN + 1).padStart(4, "0")}`;
}

/**
 * Bulk-add N aggregate slams for a player.
 * Each new slam is a doc; batch write commits them in one round-trip.
 */
export async function bulkAddSlams(input: {
  playerId: string;
  season: number;
  type: "white" | "black";
  count: number;
  clubId: string | null;
  source?: "club" | "youtube" | "tournament";
}): Promise<string[]> {
  const actor = requireAdmin();
  const db = getDb();
  if (input.count <= 0 || input.count > 100) {
    throw new Error("Slam count must be between 1 and 100.");
  }

  // Pre-allocate IDs to avoid batching hitting a race.
  const startId = await nextSlamId(db, input.season);
  const [prefix, seasonStr, startNumStr] = startId.match(/^(slam-\d+-)(\d+)$/)
    ? [
        `slam-${input.season}-`,
        String(input.season),
        startId.split("-").at(-1)!,
      ]
    : [`slam-${input.season}-`, String(input.season), "0001"];
  void prefix; void seasonStr;

  const startNum = parseInt(startNumStr, 10);
  const ids: string[] = [];
  const batch = writeBatch(db);
  for (let i = 0; i < input.count; i++) {
    const id = `slam-${input.season}-${String(startNum + i).padStart(4, "0")}`;
    ids.push(id);
    const data = {
      playerId: input.playerId,
      season: input.season,
      type: input.type,
      source: input.source ?? "club",
      clubId: input.clubId,
      tournament: null,
      date: null,
      location: "Thane",
      videoUrl: null,
      matchRef: null,
      notes: null,
      active: true,
      aggregate: true,
      ...auditFieldsForCreate(actor),
    };
    batch.set(doc(db, "slams", id), data);
  }
  await batch.commit();

  await writeAuditLog(db, actor, "slams", `${ids[0]}..${ids[ids.length - 1]}`, "create", null, {
    bulkAdd: input.count,
    type: input.type,
    playerId: input.playerId,
    season: input.season,
  });
  return ids;
}

/**
 * Soft-delete a slam (active = false). Used by the drawer's "-1" button —
 * we pick the newest aggregate slam of the requested type/season and
 * flip its active flag.
 */
export async function softDeleteSlam(slamId: string): Promise<void> {
  const actor = requireAdmin();
  const db = getDb();
  const audit = auditFieldsForUpdate(actor);
  await updateDoc(doc(db, "slams", slamId), { active: false, ...audit });
  await writeAuditLog(db, actor, "slams", slamId, "update", { active: true }, { active: false, ...audit });
}

/**
 * Remove N aggregate slams of a given type/season for a player, newest first.
 * Returns the slam IDs that were deactivated.
 */
export async function bulkRemoveAggregateSlams(input: {
  playerId: string;
  season: number;
  type: "white" | "black";
  count: number;
}): Promise<string[]> {
  const actor = requireAdmin();
  const db = getDb();
  const { getDocs, query, where, collection: coll } = await import("firebase/firestore");
  const snap = await getDocs(
    query(
      coll(db, "slams"),
      where("playerId", "==", input.playerId),
      where("season", "==", input.season),
      where("type", "==", input.type),
      where("active", "==", true)
    )
  );
  const aggregates = snap.docs
    .filter((d) => (d.data() as Slam).aggregate !== false)
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, input.count);

  if (aggregates.length === 0) {
    throw new Error(`No aggregate ${input.type} slams to remove for this player+season.`);
  }

  const audit = auditFieldsForUpdate(actor);
  const batch = writeBatch(db);
  for (const d of aggregates) {
    batch.update(doc(db, "slams", d.id), { active: false, ...audit });
  }
  await batch.commit();

  const removedIds = aggregates.map((d) => d.id);
  await writeAuditLog(db, actor, "slams", `${removedIds[0]}..${removedIds[removedIds.length - 1]}`, "update", null, {
    bulkRemove: removedIds.length,
    type: input.type,
    playerId: input.playerId,
    season: input.season,
  });
  return removedIds;
}

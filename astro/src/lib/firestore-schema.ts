// TypeScript shapes for Firestore documents. These mirror the JSON schemas
// in the legacy /data/*.json files, plus audit fields on every doc.

import type { Timestamp } from "firebase/firestore";

export interface AuditFields {
  createdBy: string;              // Firebase Auth UID
  createdByEmail?: string;        // stored for readability; not authoritative
  createdAt: Timestamp;
  updatedBy: string;
  updatedByEmail?: string;
  updatedAt: Timestamp;
}

// ── /players/{playerId} ────────────────────────────────────────────
export interface Player extends Partial<AuditFields> {
  id: string;
  name: string;
  gender: "male" | "female";
  aliases?: string[];
  clubIds: string[];
  district?: string;              // always "Thane" in prototype
  active?: boolean;               // absent = true
}

// ── /clubs/{clubId} ────────────────────────────────────────────────
export interface Club extends Partial<AuditFields> {
  id: string;
  name: string;
  contact?: string | null;
  notes?: string | null;
  district?: string;
  active?: boolean;
}

// ── /slams/{slamId} ────────────────────────────────────────────────
export type SlamType = "white" | "black";
export type SlamSource = "youtube" | "club" | "tournament";

export interface Slam extends Partial<AuditFields> {
  id: string;
  playerId: string;
  season: number;                 // fiscal-year starting year
  type: SlamType;
  source: SlamSource;
  clubId?: string | null;
  tournament?: string | null;
  date?: string | null;           // YYYY-MM-DD
  location?: string | null;
  videoUrl?: string | null;
  matchRef?: string | null;
  notes?: string | null;
  active: boolean;
  aggregate?: boolean;            // true = safe to shrink; false = has real detail
}

// ── /seasons/{yearString} ──────────────────────────────────────────
export interface Season extends Partial<AuditFields> {
  year: number;
  label: string;                  // e.g. "2024–25"
  start: string;                  // YYYY-MM-DD (April 1)
  end: string;                    // YYYY-MM-DD (March 31 next year)
  available: boolean;             // hide from public dropdown when false
  ceremonyVideoUrl?: string | null; // Optional YouTube URL for that season's award ceremony
}

// ── /admins/{uid} ──────────────────────────────────────────────────
export interface Admin {
  email: string;
  displayName?: string;
  role: "owner" | "editor";
  addedBy?: string;
  addedAt?: Timestamp;
}

// ── /audit_log/{autoId} ────────────────────────────────────────────
export interface AuditLogEntry {
  collection: "players" | "clubs" | "slams" | "seasons" | "admins";
  docId: string;
  action: "create" | "update" | "delete";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actorUid: string;
  actorEmail?: string;
  at: Timestamp;
}

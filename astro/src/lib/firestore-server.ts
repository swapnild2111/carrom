// Server-side Firestore reads for build-time page pre-rendering.
//
// Uses the Firebase Admin SDK (Node), reads via Application Default
// Credentials — GOOGLE_APPLICATION_CREDENTIALS env var pointing at a
// service-account JSON file, or `gcloud auth application-default login`.
//
// If credentials aren't available (e.g. someone runs `npm run build` without
// setting them up), we fall back to empty arrays so the build still succeeds.
// The published site would just have empty tables until the next real build.

import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Player, Club, Slam, Season } from "./firestore-schema";

let _initialized = false;
let _hasCreds = false;

function ensureInit(): boolean {
  if (_initialized) return _hasCreds;
  _initialized = true;

  if (getApps().length > 0) {
    _hasCreds = true;
    return true;
  }

  try {
    // Prefer FIREBASE_SERVICE_ACCOUNT env var if set — GitHub Actions passes
    // the JSON string this way. Otherwise fall through to ADC.
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (inline) {
      initializeApp({
        credential: cert(JSON.parse(inline)),
        projectId: "carrom-thane",
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: "carrom-thane",
      });
    }
    _hasCreds = true;
    return true;
  } catch (e) {
    console.warn("[firestore-server] no credentials, using empty fallback:", (e as Error).message);
    return false;
  }
}

async function fetchCollection<T>(name: string): Promise<T[]> {
  if (!ensureInit()) return [];
  try {
    const snap = await getFirestore().collection(name).get();
    return snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      // Convert Firestore Timestamps to ISO strings so the JSON payload is portable.
      const clean: Record<string, unknown> = { id: d.id };
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
          clean[k] = (v as { toDate: () => Date }).toDate().toISOString();
        } else {
          clean[k] = v;
        }
      }
      return clean as T;
    });
  } catch (e) {
    console.warn(`[firestore-server] fetch ${name} failed:`, (e as Error).message);
    return [];
  }
}

export interface HomeSnapshot {
  players: Player[];
  clubs: Club[];
  seasons: Season[];
  slams: Slam[];
  takenAt: string;
}

let _cachedSnapshot: HomeSnapshot | null = null;

export async function fetchHomeSnapshot(): Promise<HomeSnapshot> {
  // Cache per build process — multiple pages call this and Firestore reads are ~1s each.
  if (_cachedSnapshot) return _cachedSnapshot;

  const [players, clubs, seasons, slams] = await Promise.all([
    fetchCollection<Player>("players"),
    fetchCollection<Club>("clubs"),
    fetchCollection<Season>("seasons"),
    fetchCollection<Slam>("slams"),
  ]);
  // Keep the payload small — drop audit fields not needed for rendering.
  const trim = <T extends Record<string, unknown>>(rows: T[]): T[] =>
    rows.map(({ createdBy: _b, createdByEmail: _e, updatedBy: _u, updatedByEmail: _ue, createdAt: _c, updatedAt: _ua, ...rest }) => rest as T);
  _cachedSnapshot = {
    players: trim(players.filter((p) => (p as Player).active !== false)) as Player[],
    clubs: trim(clubs) as Club[],
    seasons: trim(seasons) as Season[],
    slams: trim(slams.filter((s) => (s as Slam).active !== false)) as Slam[],
    takenAt: new Date().toISOString(),
  };
  return _cachedSnapshot;
}

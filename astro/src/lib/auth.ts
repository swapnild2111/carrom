// Firebase Auth wrapper — Google Sign-In only.
//
// Admin authorization = signed in AND has a doc at /admins/{uid}. Firestore
// security rules enforce this on writes; the client checks it just to gate
// UI (show admin panel vs "not authorised" message).

import { getFirebaseApp, getDb, shouldUseEmulator } from "./firebase";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  connectAuthEmulator,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import type { Admin } from "./firestore-schema";

let _auth: Auth | null = null;

export function getFbAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  if (typeof window !== "undefined" && shouldUseEmulator()) {
    connectAuthEmulator(_auth, "http://localhost:9099", { disableWarnings: true });
  }
  return _auth;
}

// ── Sign-in flows ──────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(getFbAuth(), provider);
  return result.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(getFbAuth());
}

// ── Admin authorization ───────────────────────────────────────────

/**
 * Check whether a signed-in user has an /admins/{uid} doc.
 * Returns the Admin doc if so, null otherwise.
 */
export async function fetchAdminProfile(uid: string): Promise<Admin | null> {
  const snap = await getDoc(doc(getDb(), "admins", uid));
  return snap.exists() ? (snap.data() as Admin) : null;
}

/**
 * Look for a pending-admin record for this signed-in user's email. If one
 * exists, promote the user by creating /admins/{uid} with the pending role
 * and deleting the pending record.
 *
 * Returns the newly-created Admin doc, or null if there was nothing pending.
 * Failures are logged but never rethrow — the caller falls back to
 * "signed-in-not-admin" state.
 */
async function tryPromoteFromPending(user: User): Promise<Admin | null> {
  const email = user.email?.toLowerCase();
  if (!email) return null;
  const db = getDb();
  const pendingRef = doc(db, "pending_admins_by_email", email);
  try {
    const snap = await getDoc(pendingRef);
    if (!snap.exists()) return null;
    const pending = snap.data() as { role?: "owner" | "editor"; displayName?: string };
    const role = pending.role ?? "editor";
    const now = serverTimestamp();
    const adminDoc: Admin & { addedAt: unknown } = {
      email: user.email!,
      role,
      displayName: pending.displayName ?? user.displayName ?? "",
      addedBy: "pending-promotion",
      addedAt: now,
    };
    await setDoc(doc(db, "admins", user.uid), adminDoc);
    await deleteDoc(pendingRef);
    return adminDoc;
  } catch (e) {
    console.warn("[auth] pending-admin promotion failed:", e);
    return null;
  }
}

// ── Reactive helper for Svelte components ────────────────────────

export interface AuthState {
  status: "loading" | "signed-out" | "signed-in-not-admin" | "admin";
  user: User | null;
  admin: Admin | null;
}

/**
 * Subscribe to auth changes. Passes an AuthState on every change.
 * Returns an unsubscribe function.
 */
export function watchAuth(callback: (state: AuthState) => void): () => void {
  callback({ status: "loading", user: null, admin: null });
  let auth: Auth;
  try {
    auth = getFbAuth();
  } catch (e) {
    console.error("[auth] getFbAuth failed:", e);
    callback({ status: "signed-out", user: null, admin: null });
    return () => {};
  }
  return onAuthStateChanged(
    auth,
    async (user) => {
      if (!user) {
        callback({ status: "signed-out", user: null, admin: null });
        return;
      }
      // Emit "loading" while we resolve the admin doc (and, on first sign-in,
      // the pending-admin promotion). Prevents the SignIn card from flashing
      // back briefly between "popup closed" and "admin surface rendered".
      callback({ status: "loading", user, admin: null });
      let admin: Admin | null = null;
      // fetchAdminProfile reads /admins/{uid} which is only readable by
      // existing admins — for non-admins the read throws permission-denied.
      // We swallow that specifically so `tryPromoteFromPending` still gets
      // a chance to run on the caller's first sign-in.
      try {
        admin = await fetchAdminProfile(user.uid);
      } catch (e) {
        console.debug("[auth] admin doc read denied (expected for non-admins):", e);
      }
      if (!admin) {
        try {
          admin = await tryPromoteFromPending(user);
        } catch (e) {
          console.error("[auth] pending-admin promotion failed:", e);
        }
      }
      callback({
        status: admin ? "admin" : "signed-in-not-admin",
        user,
        admin,
      });
    },
    (err) => {
      console.error("[auth] onAuthStateChanged error:", err);
      callback({ status: "signed-out", user: null, admin: null });
    }
  );
}

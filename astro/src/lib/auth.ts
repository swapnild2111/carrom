// Firebase Auth wrapper — Google Sign-In (primary) + email magic-link (fallback).
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
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  connectAuthEmulator,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { Admin } from "./firestore-schema";

const EMAIL_LINK_STORAGE_KEY = "carrom_email_signin";

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

/**
 * Step 1 of email-link flow — fires a "click this link" email.
 * Step 2 (link click) is handled by `completeEmailLinkSignIn`.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.set("emailLink", "1");
  await sendSignInLinkToEmail(getFbAuth(), email, {
    url: url.toString(),
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
}

/**
 * Call this on page load. If the URL is a return from an email link,
 * completes the sign-in and returns the User. Otherwise returns null.
 */
export async function completeEmailLinkSignIn(): Promise<User | null> {
  const auth = getFbAuth();
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;
  let email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
  if (!email) {
    // Different device from where the link was requested. Prompt the user.
    email = window.prompt("Confirm the email address you signed in with:");
    if (!email) return null;
  }
  const result = await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
  // Strip the auth params from the URL so a refresh doesn't re-trigger.
  const clean = new URL(window.location.href);
  clean.searchParams.delete("emailLink");
  clean.searchParams.delete("apiKey");
  clean.searchParams.delete("oobCode");
  clean.searchParams.delete("mode");
  clean.searchParams.delete("lang");
  window.history.replaceState({}, "", clean.toString());
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
      let admin: Admin | null = null;
      try {
        admin = await fetchAdminProfile(user.uid);
      } catch (e) {
        console.error("[auth] fetchAdminProfile failed:", e);
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

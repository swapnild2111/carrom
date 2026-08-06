// Firebase client SDK init — used by all Astro islands and Svelte components.
//
// The `firebaseConfig` object below is PUBLIC — safe to commit. It's the
// client-side handshake; access is enforced by Firestore Security Rules.
//
// Auth is only initialized on demand (via getAuth()) so pure read-only
// pages don't pay the auth module cost.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBMtO9EB1eg2RD9uygqpv_Zrq1OvzDQ_3o",
  authDomain: "carrom-thane.firebaseapp.com",
  projectId: "carrom-thane",
  storageBucket: "carrom-thane.firebasestorage.app",
  messagingSenderId: "675818090621",
  appId: "1:675818090621:web:92bb10fb18fd52176a8114",
};

let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;

/**
 * Return the singleton FirebaseApp, creating it on first call.
 * Safe to call from any island — subsequent calls reuse the instance.
 */
export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  return _app;
}

/**
 * Return the Firestore instance, wired with offline persistence.
 * Automatically connects to the local emulator when running against
 * localhost (detected via window.location).
 */
export function getDb(): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (typeof window !== "undefined" && shouldUseEmulator()) {
    connectFirestoreEmulator(_db, "localhost", 8080);
  }
  return _db;
}

function shouldUseEmulator(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

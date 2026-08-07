<script lang="ts">
  // Admin gate — wraps admin content. Shows:
  //   - loading spinner while checking auth
  //   - <SignIn /> when not signed in
  //   - "not an admin" message when signed in but no /admins/{uid} doc
  //   - <slot /> when authorized
  // Also handles the email-link return flow on page load.
  import { onMount } from "svelte";
  import { watchAuth, completeEmailLinkSignIn, signOut, type AuthState } from "@/lib/auth";
  import SignIn from "./SignIn.svelte";

  let state: AuthState = $state({ status: "loading", user: null, admin: null });

  onMount(() => {
    // If we arrived from an email magic-link, finish the sign-in.
    completeEmailLinkSignIn().catch((e) => console.warn("email link failed:", e));
    return watchAuth((s) => { state = s; });
  });

  async function doSignOut() {
    await signOut();
  }
</script>

{#if state.status === "loading"}
  <div class="gate-loading" role="status" aria-live="polite">
    <span class="gate-loading-spinner" aria-hidden="true"></span>
    <p class="gate-loading-text">{state.user ? "Signing you in…" : "Checking sign-in…"}</p>
  </div>
{:else if state.status === "signed-out"}
  <SignIn />
{:else if state.status === "signed-in-not-admin"}
  <div class="gate-denied">
    <h3>Not an admin</h3>
    <p>You're signed in as <strong>{state.user?.email}</strong>, but this account isn't in the admin allowlist.</p>
    <p class="gate-denied-help">
      Ask an existing admin (owner role) to add your account. They'll need your <strong>User UID</strong>,
      visible in the Firebase console → Authentication → Users after your first sign-in.
    </p>
    <button type="button" class="btn-signout" onclick={doSignOut}>Sign out</button>
  </div>
{:else}
  <!-- User info + sign-out are rendered by AdminApp's topbar (single-row layout
       to match the Hugo live site). AdminGate only handles the auth switchboard. -->
  <slot />
{/if}

<style>
  .gate-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    padding: 3rem 1rem;
    color: var(--text-muted);
  }
  .gate-loading-text {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .gate-loading-spinner {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 3px solid rgba(74, 158, 255, 0.2);
    border-top-color: var(--accent);
    animation: gate-loading-spin 720ms linear infinite;
  }
  @keyframes gate-loading-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .gate-loading-spinner { animation-duration: 1.6s; }
  }
  .gate-denied {
    max-width: 30rem;
    margin: 2rem auto;
    padding: 1.5rem 1.6rem;
    background: var(--surface);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
  }
  .gate-denied h3 {
    margin: 0 0 0.5rem;
    color: #fca5a5;
  }
  .gate-denied p {
    margin: 0 0 0.85rem;
    color: var(--text);
    font-size: 0.95rem;
  }
  .gate-denied-help {
    color: var(--text-muted);
    font-size: 0.88rem;
    line-height: 1.55;
  }
  .btn-signout {
    appearance: none;
    height: 2.2rem;
    padding: 0 0.95rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .btn-signout:hover {
    background: var(--surface-hover);
    color: var(--text);
    border-color: var(--border);
  }
</style>

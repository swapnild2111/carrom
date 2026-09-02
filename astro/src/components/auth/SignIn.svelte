<script lang="ts">
  import { signInWithGoogle } from "@/lib/auth";

  let googlePopupOpen = $state(false);
  let error = $state("");

  async function doGoogle() {
    error = "";
    googlePopupOpen = true;
    try {
      await signInWithGoogle();
      // On mobile this returns null (redirect) — page reloads, nothing more to do.
    } catch (e) {
      googlePopupOpen = false;
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

{#if googlePopupOpen}
  <div class="signin-card signin-loading" role="status" aria-live="polite">
    <span class="signin-spinner" aria-hidden="true"></span>
    <p class="signin-loading-text">Signing you in…</p>
    <p class="signin-loading-sub">Waiting for Google to confirm your account.</p>
  </div>
{:else}
<div class="signin-card">
  <div class="signin-head">
    <h3>Admin sign-in</h3>
    <p>Only allowlisted admins can sign in.</p>
  </div>

  <button type="button" class="btn-google" onclick={doGoogle}>
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
    </svg>
    Sign in with Google
  </button>

  {#if error}
    <p class="signin-error">{error}</p>
  {/if}
</div>
{/if}

<style>
  .signin-loading {
    align-items: center;
    gap: 0.9rem;
  }
  .signin-loading-text {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
  }
  .signin-loading-sub {
    margin: 0;
    font-size: 0.88rem;
    color: var(--text-muted);
    text-align: center;
  }
  .signin-spinner {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 3px solid rgba(74, 158, 255, 0.2);
    border-top-color: var(--accent);
    animation: signin-spin 720ms linear infinite;
  }
  @keyframes signin-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .signin-spinner { animation-duration: 1.6s; }
  }
  .signin-card {
    max-width: 26rem;
    margin: 2rem auto;
    padding: 1.5rem 1.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .signin-head h3 {
    margin: 0 0 0.35rem;
    font-size: 1.1rem;
  }
  .signin-head p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .btn-google {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    height: 2.6rem;
    padding: 0 1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text);
    font-family: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .btn-google:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
  }
  .signin-error {
    margin: 0;
    padding: 0.6rem 0.8rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-sm);
    color: #fca5a5;
    font-size: 0.88rem;
  }
</style>

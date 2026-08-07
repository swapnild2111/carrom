<script lang="ts">
  // Sign-in card. Two paths: Google popup (primary) or email magic-link.
  // Rendered inside AdminGate when auth state is "signed-out".
  import { signInWithGoogle, sendMagicLink } from "@/lib/auth";

  let email = $state("");
  let sending = $state(false);
  let magicLinkSent = $state(false);
  let error = $state("");

  async function doGoogle() {
    error = "";
    try {
      await signInWithGoogle();
      // AdminGate re-renders on auth-state change automatically.
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function doMagicLink() {
    error = "";
    if (!email.trim()) {
      error = "Enter an email address first.";
      return;
    }
    sending = true;
    try {
      await sendMagicLink(email.trim());
      magicLinkSent = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      sending = false;
    }
  }
</script>

<div class="signin-card">
  <div class="signin-head">
    <h3>Admin sign-in</h3>
    <p>Only allowlisted admins can add or edit data. Sign in with Google, or ask for a one-time email link.</p>
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

  <div class="signin-divider"><span>or</span></div>

  {#if magicLinkSent}
    <div class="signin-sent">
      <p><strong>Check your email.</strong> Click the link we sent to <code>{email}</code>. It'll bring you back here and sign you in.</p>
      <button type="button" class="btn-linkish" onclick={() => { magicLinkSent = false; email = ""; }}>
        Try another email
      </button>
    </div>
  {:else}
    <label class="signin-field">
      <span>Email</span>
      <input
        type="email"
        placeholder="you@example.com"
        bind:value={email}
        autocomplete="email"
        onkeydown={(e) => { if (e.key === "Enter") doMagicLink(); }}
      />
    </label>
    <button type="button" class="btn-email" onclick={doMagicLink} disabled={sending}>
      {sending ? "Sending…" : "Email me a sign-in link"}
    </button>
  {/if}

  {#if error}
    <p class="signin-error">{error}</p>
  {/if}
</div>

<style>
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
  .btn-google, .btn-email {
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
  .btn-google:hover, .btn-email:hover {
    background: var(--surface-hover);
    border-color: var(--accent);
  }
  .btn-email {
    background: var(--accent);
    color: #0c1017;
    border-color: var(--accent);
  }
  .btn-email:hover {
    background: var(--accent-hover);
  }
  .btn-email:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .signin-divider {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .signin-divider::before, .signin-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border-subtle);
  }
  .signin-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .signin-field span {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .signin-field input {
    padding: 0.6rem 0.85rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-family: inherit;
    font-size: 0.95rem;
  }
  .signin-field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.15);
  }
  .signin-sent {
    padding: 0.85rem 1rem;
    background: rgba(74, 158, 255, 0.08);
    border: 1px solid rgba(74, 158, 255, 0.28);
    border-radius: var(--radius-sm);
  }
  .signin-sent p { margin: 0 0 0.5rem; }
  .btn-linkish {
    appearance: none;
    background: none;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
    padding: 0;
    text-decoration: underline;
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

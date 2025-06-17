import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

/* ─── Extend Window so we avoid `any` ───────────────────────── */
declare global {
  interface Window {
    auth0Client: Auth0Client;
  }
}

const init = async (): Promise<void> => {
  console.log('[TS] 🚀 creating Auth0 client…');

  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    authorizationParams: {
      redirect_uri: 'https://the-catholic-herald-5d6c2-bedae55b34495.webflow.io/',
      audience: 'https://authenticate.thecatholicherald.com',
    },
  });

  /* expose for inline scripts & debugging */
  window.auth0Client = client;
  console.log('[Bundle] window.auth0Client set', client);

  /* ── handle redirect callback (if present) ───────────────── */
  const qs = new URLSearchParams(window.location.search);
  if (qs.get('code') && qs.get('state')) {
    console.log('[TS] ↩️ handling Auth0 redirect…');
    await client.handleRedirectCallback();
    history.replaceState({}, document.title, window.location.origin + window.location.pathname);
  }

  /* ── login state ─────────────────────────────────────────── */
  const isLoggedIn = await client.isAuthenticated();
  console.log('[TS] 🔑 isLoggedIn =', isLoggedIn);

  /* ── subscriber claim (from Auth0 Action) ───────────────── */
  const claims = await client.getIdTokenClaims();
  const isSubscriber = claims?.['https://catholicherald.com/claims/subscriber'] === true;
  if (claims) {
    console.log('subscriber claim →', claims['https://catholicherald.com/claims/subscriber']);
  }

  console.log('[TS] 🏷️  isSubscriber =', isSubscriber);

  if (isSubscriber) {
    console.log('[TS] ❌ disabling Poool for subscriber');
    (window as any).poool = (_?: unknown) => {
      /* noop for subscribers */
    };
    document.dispatchEvent(new Event('poool:disable'));
    document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
  }

  /* ── button logic ────────────────────────────────────────── */
  const loginBtn = document.getElementById('auth-login') as HTMLElement | null;
  const logoutBtn = document.getElementById('auth-logout') as HTMLElement | null;

  console.log('[TS] loginBtn:', loginBtn);
  console.log('[TS] logoutBtn:', logoutBtn);

  if (loginBtn && logoutBtn) {
    if (isLoggedIn) {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
    } else {
      loginBtn.style.display = 'inline-block';
      logoutBtn.style.display = 'none';
    }

    loginBtn.addEventListener('click', () => {
      console.log('[TS] ▶️ login clicked');
      client.loginWithRedirect();
    });

    logoutBtn.addEventListener('click', () => {
      console.log('[TS] ▶️ logout clicked');
      client.logout();
    });
  } else {
    console.warn('[TS] ⚠️ auth buttons not found in DOM');
  }
  // … after your login/logout toggle …
  if (isLoggedIn) {
    // fetch the user profile
    const user = await client.getUser();

    // log it unconditionally so you can inspect every field
    console.log('[TS] user →', user);

    // 2) derive displayName
    let displayName: string;
    if (user?.nickname) {
      displayName = user.nickname;
    } else if (user?.name) {
      displayName = user.name;
    } else if (user?.email) {
      displayName = user?.email.split('@')[0];
    } else {
      displayName = 'Account';
    }

    // 3) render it
    const userEl = document.getElementById('auth-username');
    if (userEl) {
      userEl.textContent = displayName;
      console.log('[TS] displayed name:', displayName);
    } else {
      console.warn('[TS] auth-username element not found');
    }
  }
};

init().catch((err) => console.error('[TS] ❗ init error', err));

console.log('Hi');

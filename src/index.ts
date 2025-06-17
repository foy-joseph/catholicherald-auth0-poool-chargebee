/* import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

declare global {
  interface Window {
    auth0Client: Auth0Client;
  }
}

const init = async () => {
  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    authorizationParams: {
      redirect_uri: 'https://the-catholic-herald-5d6c2-bedae55b34495.webflow.io/',
      audience: 'https://authenticate.thecatholicherald.com',
    },
  });

  (window as unknown as { auth0Client: Auth0Client }).auth0Client = client;

  console.log("We're in.");

  const isLoggedIn = await client.isAuthenticated(); //check if user is logged in or not

  const url = new URLSearchParams(window.location.search);
  const code = url.get('code');
  if (code) {
    await client.handleRedirectCallback();
    history.replaceState({}, document.title, window.location.origin + window.location.pathname);
  }

  const claims = await client.getIdTokenClaims();
  const isSubscriber: boolean = claims?.['https://catholicherald.com/claims/subscriber'] === true;

  if (isSubscriber) {
    (window as any).poool = () => {
    };
    document.dispatchEvent(new Event('poool:disable')); // Poool SDK hook
    // If Poool widgets already exist, remove them:
    document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
  }

  window.Webflow ||= [];
  window.Webflow.push(() => {
    const loginElement = document.querySelector('[data-element="login"]');
    const logoutElement = document.querySelector('[data-element="logout"]');
    if (!loginElement || !logoutElement) return;

    loginElement.addEventListener('click', async () => {
      await client.loginWithRedirect();
    });

    logoutElement.addEventListener('click', async () => {
      await client.logout();
    });
  });
};

init();
*/

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
  // … after isLoggedIn = await client.isAuthenticated()
  if (isLoggedIn) {
    // fetch the profile (may be undefined)
    const user = await client.getUser();
    // find your target element
    const userEl = document.getElementById('auth-username');

    // only proceed if both exist
    if (user && user.name && userEl) {
      userEl.textContent = user.name;
    }
  }
  console.log('[TS] 🔑 isLoggedIn =', isLoggedIn);

  /* ── subscriber claim (from Auth0 Action) ───────────────── */
  const claims = await client.getIdTokenClaims();
  const isSubscriber = claims?.['https://catholicherald.com/claims/subscriber'] === true;

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
      console.log('[TS] 👁‍🗨 hide login, show logout');
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
    } else {
      console.log('[TS] 👁‍🗨 show login, hide logout');
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
};

init().catch((err) => console.error('[TS] ❗ init error', err));

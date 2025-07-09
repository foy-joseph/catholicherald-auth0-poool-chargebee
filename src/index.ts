import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

// Extend Window interface for our Auth0 client
declare global {
  interface Window {
    auth0Client: Auth0Client;
    customerId: string;
  }
}

async function init(): Promise<void> {
  console.log('[TS] 1) init() start');

  // 2) Create Auth0 client
  console.log('[TS] 2) Creating Auth0 client');
  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    authorizationParams: {
      redirect_uri: 'https://the-catholic-herald-5d6c2-bedae55b34495.webflow.io/',
      audience: 'https://authenticate.thecatholicherald.com',
    },
  });
  window.auth0Client = client;
  document.dispatchEvent(new Event('auth0-ready'));
  console.log('[TS] 3) Auth0 client created and exposed on window');

  // 4) Handle redirect callback
  const qs = new URLSearchParams(window.location.search);
  if (qs.has('code') && qs.has('state')) {
    console.log('[TS] 4) Detected code/state in URL, calling handleRedirectCallback');
    try {
      await client.handleRedirectCallback();
      console.log('[TS] 5) handleRedirectCallback completed');
      history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('[TS] ❗ handleRedirectCallback error', err);
    }
  } else {
    console.log('[TS] 4) No code/state in URL, skipping callback');
  }

  // 6) Check authentication state
  let isLoggedIn = false;
  try {
    isLoggedIn = await client.isAuthenticated();
    console.log('[TS] 6) isAuthenticated →', isLoggedIn);
    if (isLoggedIn) {
      const customer_id = (await client.getIdTokenClaims())?.customer_id;
      setPortal(customer_id);
    }
  } catch (err) {
    console.error('[TS] ❗ isAuthenticated error', err);
  }

  // 7) Retrieve and log all ID token claims
  let claims: Record<string, any> | undefined;
  try {
    claims = await client.getIdTokenClaims();
    console.log('[TS] 7) getIdTokenClaims →', claims);
  } catch (err) {
    console.error('[TS] ❗ getIdTokenClaims error', err);
  }

  // 8) Check custom subscriber claim
  const claimKey = 'https://catholicherald.com/claims/subscriber';
  const isSubscriber = claims?.[claimKey] === true;
  console.log(
    `[TS] 8) Claim [${claimKey}] →`,
    claims?.[claimKey],
    '→ isSubscriber =',
    isSubscriber
  );

  // 9) Branch on subscription
  if (isSubscriber) {
    console.log('[TS] 9) Subscriber detected, disabling Poool');
    // Disable Poool SDK
    (window as any).poool = () => {
      // nothing
    };
    document.dispatchEvent(new Event('poool:disable'));
    document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
  } else {
    console.log('[TS] 9) No subscription found, paywall remains');
  }

  // 10) Wire login/logout buttons
  console.log('[TS] 10) Wiring login/logout buttons');
  const loginBtn = document.getElementById('auth-login');
  const logoutBtn = document.getElementById('auth-logout');
  console.log('[TS] 10) loginBtn →', loginBtn, '| logoutBtn →', logoutBtn);
  if (loginBtn instanceof HTMLElement && logoutBtn instanceof HTMLElement) {
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
    console.warn('[TS] ⚠️ auth buttons not found or not HTMLElements');
  }

  console.log('[TS] 11) init() complete');
}

init().catch((err) => console.error('[TS] ❗ init error', err));

function setPortal(customer_id: string) {
  console.log('creating portal...');
  $.ajax({
    url: 'https://catholicherald.it-548.workers.dev', // <-- replace with your backend route
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({
      portal: true,
      customer_id: customer_id,
      redirect_url: window.location.href,
    }),
    success: function (response) {
      console.log('Portal created!', response);
      // Redirect to thank you page or show confirmation
    },
    error: function (err) {
      console.error('Error creating portal', err.responseText);
    },
  });
}

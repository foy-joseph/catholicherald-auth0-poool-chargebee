import { type Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

declare global {
  interface Window {
    auth0Client: Auth0Client;
  }
}

async function authCallback() {
  const client = await createAuth0Client({
    domain: 'the-catholic-herald.us.auth0.com',
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    cacheLocation: 'localstorage',
    useRefreshTokens: true,
    authorizationParams: {
      redirect_uri: window.location.origin + '/auth/callback',
    },
  });

  try {
    const result = await client.handleRedirectCallback();
    let returnTo = '/';
    if (!result.appState?.returnTo) {
      const urlParams = new URLSearchParams(window.location.search);
      const queryReturnTo = urlParams.get('returnTo');
      if (queryReturnTo) {
        returnTo = decodeURIComponent(queryReturnTo);
      }
    } else {
      returnTo = result.appState?.returnTo;
    }
    window.location.replace(returnTo);
  } catch (err) {
    console.error('Auth0 callback error:', err);
    window.location.replace('/');
  }
}

async function init() {
  if (window.location.pathname === '/auth/callback') {
    return await authCallback();
  }

  // Create Auth0 client
  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    cacheLocation: 'localstorage',
    useRefreshTokens: true,
    authorizationParams: {
      redirect_uri: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(
        window.location.pathname
      )}`,
    },
  });

  window.auth0Client = client;
  document.dispatchEvent(new Event('auth0-ready'));

  // Check authentication state
  let isLoggedIn = false;
  try {
    isLoggedIn = await client.isAuthenticated();
    if (isLoggedIn) {
      const customer_id = (await client.getIdTokenClaims())?.customer_id;
      setPortal(customer_id);
    } else {
      const portalLink = document.querySelector<HTMLAnchorElement>('[data-ch-portal]');
      if (portalLink && portalLink?.parentNode) {
        (portalLink.parentNode as HTMLDivElement).style.display = 'none';
      }
    }
  } catch (err) {
    console.error('[TS] ❗ isAuthenticated error', err);
  }

  // Retrieve and log all ID token claims
  let claims;
  try {
    claims = await client.getIdTokenClaims();
  } catch (err) {
    console.error('[TS] ❗ getIdTokenClaims error', err);
  }

  // Check custom subscriber claim
  const claimKey = 'https://catholicherald.com/claims/subscriber';
  const isSubscriber = claims?.[claimKey] === true;

  const validSubscriptionTypes = [
    'catholic-herald-digital-only-GBP-Monthly',
    'catholic-herald-digital-only',
    'catholic-herald-digital-only-USD-Monthly',
    'catholic-herald-digital-only-USD-Yearly',
    'catholic-herald-digital-only-monthly',
    'catholic-herald-digital-only-monthly-euro',
    'catholic-herald-digital-only-quarterly',
    'catholic-herald-print--digital-GBP-Monthly',
    'catholic-herald-print-&-digital',
    'catholic-herald-print-Monthly-digital-USD',
    'catholic-herald-Annual-print-digital-USD',
    'catholic-herald-print-&-digital-europe-annual-euro',
    'catholic-herald-print-&-digital-europe-monthly',
    'catholic-herald-print-&-digital-europe-monthly-euro',
    'catholic-herald-print-&-digital-international-annual',
    'catholic-herald-print-&-digital-international-monthly',
    'catholic-herald-print-&-digital-monthly',
    'catholic-herald-print-&-digital-quarterly',
    'uk-digital-only-offer',
    'usa-catholic-herald-print-&-digital',
    'usa-catholic-herald-print-&-digital-monthly',
    'usa-catholic-herald-print-&-digital-quarterly',
    'usa-digital-only-annual',
    'usa-digital-only-monthly',
    'usa-digital-only-quarterly',
    'us-digital-only-offer',
    '3-Month-Digital-Deal-GBP',
  ];

  const claimKeyCatholic = 'https://catholicherald.com/claims/item_price_ids';

  const planIds = Array.isArray(claims?.[claimKeyCatholic]) ? claims[claimKeyCatholic] : [];

  const isCatholicSubscriber = planIds.some((id) =>
    validSubscriptionTypes.some((type) => id === type)
  );

  // Branch on subscription
  if (isSubscriber && isCatholicSubscriber) {
    // Disable Poool SDK
    document.dispatchEvent(new Event('poool:disable'));
    document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
  } else {
    document.dispatchEvent(new Event('no-subscription'));
  }

  // Wire login/logout buttons

  const loginBtn = document.getElementById('auth-login');
  const logoutBtn = document.getElementById('auth-logout');
  const loginBtnMobile = document.getElementById('auth-login-mobile');
  const logoutBtnMobile = document.getElementById('auth-logout-mobile');
  if (loginBtn && logoutBtn && logoutBtnMobile && loginBtnMobile) {
    if (isLoggedIn) {
      loginBtn.style.display = 'none';
      logoutBtn.style.display = 'inline-block';
      loginBtnMobile.style.display = 'none';
      logoutBtnMobile.style.display = 'inline-block';
    } else {
      loginBtn.style.display = 'inline-block';
      logoutBtn.style.display = 'none';
      loginBtnMobile.style.display = 'inline-block';
      logoutBtnMobile.style.display = 'none';
    }

    loginBtnMobile.addEventListener('click', () => {
      console.log('[TS] ▶️ login clicked');
      client.loginWithRedirect({
        appState: {
          returnTo: window.location.pathname,
        },
        // authorizationParams: {
        //   redirect_uri: `${window.location.origin}/auth/callback`,
        // },
      });
    });
    logoutBtnMobile.addEventListener('click', () => {
      client.logout({ logoutParams: { returnTo: window.location.origin } });
    });

    loginBtn.addEventListener('click', () => {
      client.loginWithRedirect({
        appState: {
          returnTo: window.location.pathname,
        },
      });
    });
    logoutBtn.addEventListener('click', () => {
      client.logout({ logoutParams: { returnTo: window.location.origin } });
    });
  } else {
    console.warn('[TS] ⚠️ auth buttons not found or not HTMLElements');
  }

  signInSetup(client);
}

init().catch((err) => console.error('[TS] ❗ init error', err));

async function signInSetup(client: Auth0Client) {
  const signInBtn = document.getElementById('ch-sign-in-button');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const googleBtn = document.getElementById('ch-sign-in-with-google');

  // stop if we're not on the login page
  if (!signInBtn || !emailInput || !passwordInput || !googleBtn) return;

  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, '/');
  }

  // const isAuthenticated = await client.isAuthenticated();
  // if (isAuthenticated) {
  //   await client.getTokenSilently();
  //   (await client.getIdTokenClaims()).__raw;
  // }

  const WORKER_URL = 'https://ch-login.it-548.workers.dev/';

  signInBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = (emailInput as HTMLInputElement)?.value;
    const password = (passwordInput as HTMLInputElement)?.value;

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    // data will contain access_token, id_token, refresh_token (if configured)
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
      alert('Login successful!');
    }
  });

  googleBtn.addEventListener('click', async () => {
    await client.loginWithRedirect({
      appState: {
        returnTo: window.location.pathname,
      },
      authorizationParams: {
        connection: 'google-oauth2',
        redirect_uri: window.location.origin,
      },
    });
  });
}

function setPortal(customer_id: string) {
  document.querySelector('[data-ch-portal]')?.addEventListener('click', (e) => {
    e.stopPropagation();
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
        const sessionURL = response.portalSession.portal_session.access_url;
        window.location.href = sessionURL;
      },
      error: function (err) {
        console.error('Error creating portal', err.responseText);
      },
    });
  });
}

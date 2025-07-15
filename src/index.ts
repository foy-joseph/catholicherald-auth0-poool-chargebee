import { type Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

// Extend Window interface for our Auth0 client
declare global {
  interface Window {
    auth0Client: Auth0Client;
    customerId: string;
    articleReady: boolean;
  }
}

async function authCallback(): Promise<void> {
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
    console.log(result);
    console.log(result.appState);
    // const returnTo = result.appState?.returnTo || '/';
    // window.location.replace(returnTo);
  } catch (err) {
    console.error('Auth0 callback error:', err);
    window.location.replace('/');
  }
}

async function init(): Promise<void> {
  if (window.location.pathname === '/auth/callback') {
    console.log('[TS] Skipping init() on /auth/callback');
    return await authCallback();
  }

  console.log('[TS] 1) init() start');

  // 2) Create Auth0 client
  console.log('[TS] 2) Creating Auth0 client');
  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    cacheLocation: 'localstorage',
    authorizationParams: {
      redirect_uri: `${window.location.origin}/auth/callback`,
      // audience: 'https://authenticate.thecatholicherald.com',
    },
  });
  window.auth0Client = client;
  document.dispatchEvent(new Event('auth0-ready'));
  console.log('[TS] 3) Auth0 client created and exposed on window');

  // 4) Handle redirect callback
  // const qs = new URLSearchParams(window.location.search);
  // if (qs.has('code') && qs.has('state')) {
  //   console.log('[TS] 4) Detected code/state in URL, calling handleRedirectCallback');
  //   try {
  //     const { appState } = await client.handleRedirectCallback();
  //     // history.replaceState({}, document.title, window.location.pathname);
  //     window.location.href = appState?.returnTo || '/';
  //     console.log('[TS] 5) handleRedirectCallback completed');
  //   } catch (err) {
  //     console.error('[TS] ❗ handleRedirectCallback error', err);
  //   }
  // } else {
  //   console.log('[TS] 4) No code/state in URL, skipping callback');
  // }

  // 6) Check authentication state
  let isLoggedIn = false;
  try {
    isLoggedIn = await client.isAuthenticated();
    console.log('[TS] 6) isAuthenticated →', isLoggedIn);
    if (isLoggedIn) {
      const customer_id = (await client.getIdTokenClaims())?.customer_id;
      setPortal(customer_id);
    } else {
      const portalLink = document.querySelector<HTMLAnchorElement>('[data-ch-portal]');
      if (portalLink && portalLink?.parentNode)
        (portalLink.parentNode as HTMLDivElement).style.display = 'none';
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

  const claimKeyCatholic = 'https://catholicherald.com/claims/item_price_ids';

  const planIds: string[] = Array.isArray(claims?.[claimKeyCatholic])
    ? claims![claimKeyCatholic]
    : [];
  const isCatholicSubscriber = planIds.some((id) => id.startsWith('catholic'));

  // 9) Branch on subscription
  if (isSubscriber && isCatholicSubscriber) {
    console.log('[TS] 9) Subscriber detected, disabling Poool');
    // Disable Poool SDK
    (window as any).poool = () => {
      // nothing
    };
    //if (window?.articleReady === true) {
    document.dispatchEvent(new Event('poool:disable'));
    document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
    //} else {
    // document.addEventListener('article-ready', function () {
    //   document.dispatchEvent(new Event('poool:disable'));
    //   document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
    // });
    // }
  } else {
    document.dispatchEvent(new Event('no-subscription'));
    console.log('[TS] 9) No subscription found, paywall remains');
  }

  // 10) Wire login/logout buttons
  console.log('[TS] 10) Wiring login/logout buttons');
  const loginBtn = document.getElementById('auth-login');
  const logoutBtn = document.getElementById('auth-logout');
  const loginBtnMobile = document.getElementById('auth-login-mobile');
  const logoutBtnMobile = document.getElementById('auth-logout-mobile');
  console.log('[TS] 10) loginBtn →', loginBtn, '| logoutBtn →', logoutBtn);
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
        authorizationParams: {
          redirect_uri: `${window.location.origin}/auth/callback`,
        },
      });
    });
    logoutBtnMobile.addEventListener('click', () => {
      console.log('[TS] ▶️ logout clicked');
      client.logout({ returnTo: window.location.origin });
    });

    loginBtn.addEventListener('click', () => {
      console.log('[TS] ▶️ login clicked');
      client.loginWithRedirect({
        appState: {
          returnTo: window.location.pathname,
        },
        authorizationParams: {
          redirect_uri: `${window.location.origin}/auth/callback`,
        },
      });
    });
    logoutBtn.addEventListener('click', () => {
      console.log('[TS] ▶️ logout clicked');
      client.logout({ returnTo: window.location.origin });
    });
  } else {
    console.warn('[TS] ⚠️ auth buttons not found or not HTMLElements');
  }

  console.log('[TS] 11) init() complete');
}

init().catch((err) => console.error('[TS] ❗ init error', err));

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

import { type Auth0Client, createAuth0Client, type IdToken } from '@auth0/auth0-spa-js';

declare global {
  interface Window {
    auth0Client: Auth0Client;
    chUser: IdToken | undefined;
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

function hidePortal() {
  const portalLink = document.querySelector<HTMLAnchorElement>('[data-ch-portal]');
  if (portalLink && portalLink?.parentNode) {
    (portalLink.parentNode as HTMLDivElement).style.display = 'none';
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

  let claims;
  // check if user is logged in via Auth0
  let isLoggedIn = false;
  try {
    isLoggedIn = await client.isAuthenticated();
    if (isLoggedIn) {
      // check auth0 for user
      claims = await client.getIdTokenClaims();
    } else {
      // check local storage for user
      claims = await getUser();
      isLoggedIn = !!claims;
    }
  } catch (err) {
    console.error('[TS] ❗ isAuthenticated error', err);
  }

  if (claims?.customer_id) {
    setPortal(claims.customer_id);
  } else {
    hidePortal();
  }

  window.chUser = claims;
  document.dispatchEvent(new Event('auth0-ready'));

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

  setUpLoginButtons(client, isLoggedIn);

  await signInSetup(client);
}

init().catch((err) => console.error('[TS] ❗ init error', err));

function setUpLoginButtons(client: Auth0Client, isLoggedIn: boolean) {
  // Wire login/logout buttons
  const loginBtn = document.getElementById('auth-login');
  const logoutBtn = document.getElementById('auth-logout');
  const loginBtnMobile = document.getElementById('auth-login-mobile');
  const logoutBtnMobile = document.getElementById('auth-logout-mobile');

  if (!loginBtn || !logoutBtn || !logoutBtnMobile || !loginBtnMobile) {
    return;
  }

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
    window.location.href = '/sign-in?returnTo=' + encodeURIComponent(window.location.pathname);
  });
  loginBtn.addEventListener('click', () => {
    window.location.href = '/sign-in?returnTo=' + encodeURIComponent(window.location.pathname);
  });

  logoutBtnMobile.addEventListener('click', () => {
    localStorage.removeItem('ch_id_token');
    client.logout({ logoutParams: { returnTo: window.location.pathname } });
  });
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('ch_id_token');
    client.logout({ logoutParams: { returnTo: window.location.pathname } });
  });
}

// gets the user from the local storage token, or gets a new token if the old one is expired
async function getUser() {
  const token = localStorage.getItem('ch_id_token');
  if (!token) return undefined;
  const tokenData = JSON.parse(token);
  let user = JSON.parse(atob(tokenData.id_token.split('.')[1]));

  const timeNow = Math.floor(Date.now() / 1000); // current time in seconds
  if (timeNow >= user.exp) {
    const newToken = await refreshToken(tokenData.refresh_token);
    user = JSON.parse(atob(newToken.split('.')[1]));
    if (!user) return undefined;
    console.log('Token refreshed');
  }
  return user;
}

async function refreshToken(refresh_token: string) {
  const WORKER_URL = 'https://ch-login.it-548.workers.dev/refresh';
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token }),
  });
  if (!res.ok) {
    console.log(await res.json());
    throw new Error('Refresh failed');
  }
  const data = await res.json();
  // replace the old token with the new one
  // reuses the same refresh token unless we get a new one
  localStorage.setItem(
    'ch_id_token',
    JSON.stringify({
      refresh_token,
      ...data,
    })
  );
  return data.id_token;
}

async function signInSetup(client: Auth0Client) {
  const signInBtn = document.getElementById('ch-sign-in-button');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const googleBtn = document.getElementById('ch-sign-in-with-google');
  const googleBtnWrapper = document.querySelector<HTMLDivElement>('.continue-with-google');
  const forgotPasswordBtn = document.getElementById('ch-forgot-password');
  const alternativeLoginMethod = document.getElementById('ch-alternative-login-method');
  const resetPasswordBtn = document.getElementById('ch-reset-password-button');
  const resetPasswordBackLink = document.getElementById('ch-login-back-link');
  const loadingSpinner = document.getElementById('ch-loading-spinner');
  const passwordResetConfirmation = document.getElementById('ch-password-reset-confirmation');
  const signInHeading = document.getElementById('ch-sign-in-heading');
  const errorFeedback = document.getElementById('ch-login-error-feedback');
  // stop if we're not on the login page
  if (
    !signInBtn ||
    !emailInput ||
    !passwordInput ||
    !googleBtn ||
    !googleBtnWrapper ||
    !forgotPasswordBtn ||
    !alternativeLoginMethod ||
    !resetPasswordBtn ||
    !resetPasswordBackLink ||
    !loadingSpinner ||
    !passwordResetConfirmation ||
    !signInHeading ||
    !errorFeedback
  )
    return;

  console.log('all inputs found');

  const WORKER_URL = 'https://ch-login.it-548.workers.dev/login';
  const returnLocation = new URLSearchParams(window.location.search).get('returnTo');
  const returnTo = returnLocation ?? window.location.pathname;

  signInBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log('sign in button clicked');
    const email = (emailInput as HTMLInputElement)?.value;
    const password = (passwordInput as HTMLInputElement)?.value;

    loadingSpinner.style.display = 'flex';

    emailInput.style.display = 'none';
    passwordInput.style.display = 'none';
    forgotPasswordBtn.style.display = 'none';
    signInBtn.style.display = 'none';
    googleBtnWrapper.style.display = 'none';
    alternativeLoginMethod.style.display = 'none';
    errorFeedback.style.display = 'none';

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    // data will contain access_token, id_token, refresh_token (if configured)
    if (data.id_token) {
      localStorage.setItem('ch_id_token', JSON.stringify(data));
      window.location.href = returnTo;
    } else {
      errorFeedback.textContent = data.error;
      errorFeedback.style.display = 'block';
      emailInput.style.display = 'block';
      passwordInput.style.display = 'block';
      forgotPasswordBtn.style.display = 'block';
      signInBtn.style.display = 'block';
      googleBtnWrapper.style.display = 'block';
      alternativeLoginMethod.style.display = 'flex';
      loadingSpinner.style.display = 'none';
    }
  });

  forgotPasswordBtn.addEventListener('click', async () => {
    passwordInput.style.display = 'none';
    forgotPasswordBtn.style.display = 'none';
    signInBtn.style.display = 'none';
    googleBtnWrapper.style.display = 'none';
    alternativeLoginMethod.style.display = 'none';
    resetPasswordBtn.style.display = 'block';
    resetPasswordBackLink.style.display = 'block';
    signInHeading.textContent = 'Reset Password';
    errorFeedback.style.display = 'none';
  });

  resetPasswordBackLink.addEventListener('click', async () => {
    passwordInput.style.display = 'block';
    forgotPasswordBtn.style.display = 'block';
    signInBtn.style.display = 'block';
    googleBtnWrapper.style.display = 'block';
    alternativeLoginMethod.style.display = 'flex';
    resetPasswordBtn.style.display = 'none';
    resetPasswordBackLink.style.display = 'none';
    signInHeading.textContent = 'Sign In';
    errorFeedback.style.display = 'none';
  });

  resetPasswordBtn.addEventListener('click', async () => {
    emailInput.style.display = 'none';
    passwordInput.style.display = 'none';
    forgotPasswordBtn.style.display = 'none';
    signInBtn.style.display = 'none';
    googleBtnWrapper.style.display = 'none';
    resetPasswordBtn.style.display = 'none';
    resetPasswordBackLink.style.display = 'none';
    loadingSpinner.style.display = 'flex';
    errorFeedback.style.display = 'none';
    const email = (emailInput as HTMLInputElement)?.value;
    const message = await forgotPassword(email);
    console.log('message', message);
    if (message.error) {
      errorFeedback.textContent = message.error;
      errorFeedback.style.display = 'block';
      loadingSpinner.style.display = 'none';
      return;
    }
    passwordResetConfirmation.textContent = message;
    passwordResetConfirmation.style.display = 'block';
    loadingSpinner.style.display = 'none';
  });

  googleBtn.addEventListener('click', async () => {
    await client.loginWithRedirect({
      appState: {
        returnTo: returnTo,
      },
      authorizationParams: {
        connection: 'google-oauth2',
        redirect_uri: window.location.origin + '/auth/callback',
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

async function forgotPassword(email: string) {
  const WORKER_URL = 'https://ch-login.it-548.workers.dev/forgot-password';
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (res.status === 200) {
    const data = await res.json();
    return data;
  }
  return null;
}

import { type Auth0Client, createAuth0Client, type IdToken } from '@auth0/auth0-spa-js';

import { UIHandler } from './ui-handler';

declare global {
  interface Window {
    auth0Client: Auth0Client;
    chUser: IdToken | undefined;
    articleReady: boolean | undefined;
    chCheckout: {
      get: () => CheckoutIntent | null;
      clear: () => void;
      planMap: Record<string, string>;
      resolveSlug: (slug: string) => string | undefined;
    };
  }
}

// --- Deep-link checkout intent capture ---
// Reads ?plan, ?coupon and UTMs from the URL on every page load, persists to
// localStorage so downstream checkout code can pick them up. First-touch wins
// for landingPage + timestamp; last-touch wins for plan, coupon, UTMs.

const CHECKOUT_INTENT_KEY = 'ch_checkout_intent';
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const COUPON_REGEX = /^[A-Z0-9_-]{1,40}$/;
const INTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PLAN_MAP: Record<string, string> = {
  'us-digital-monthly': 'usa-digital-only-monthly',
  'us-digital-quarterly': 'usa-digital-only-quarterly',
  'us-digital-annual': 'usa-digital-only-annual',
  'uk-digital-monthly': 'catholic-herald-digital-only-monthly',
  'uk-digital-quarterly': 'catholic-herald-digital-only-quarterly',
  'uk-digital-annual': 'catholic-herald-digital-only',
  'us-print-digital-monthly': 'usa-catholic-herald-print-&-digital-monthly',
  'us-print-digital-quarterly': 'usa-catholic-herald-print-&-digital-quarterly',
  'us-print-digital-annual': 'usa-catholic-herald-print-&-digital',
  'uk-print-digital-monthly': 'catholic-herald-print-&-digital-monthly',
  'uk-print-digital-quarterly': 'catholic-herald-print-&-digital-quarterly',
  'uk-print-digital-annual': 'catholic-herald-print-&-digital',
};

interface CheckoutIntent {
  plan?: string;
  itemPriceId?: string;
  coupon?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  landingPage: string;
  timestamp: string;
  lastUpdated: string;
}

function getStoredCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as CheckoutIntent;
    // Expire stale intents based on most recent param-bearing visit
    const ageSource = intent.lastUpdated ?? intent.timestamp;
    if (ageSource) {
      const age = Date.now() - new Date(ageSource).getTime();
      if (Number.isFinite(age) && age > INTENT_TTL_MS) {
        clearCheckoutIntent();
        return null;
      }
    }
    return intent;
  } catch {
    return null;
  }
}

function clearCheckoutIntent(): void {
  try {
    localStorage.removeItem(CHECKOUT_INTENT_KEY);
  } catch (err) {
    console.error('[CH Checkout Intent] Failed to clear:', err);
  }
}

function captureCheckoutIntent(): void {
  const params = new URLSearchParams(window.location.search);
  const planPresent = params.has('plan');
  const couponPresent = params.has('coupon');
  const hasUtm = UTM_PARAMS.some((k) => params.has(k));

  if (!planPresent && !couponPresent && !hasUtm) return;

  const stored = getStoredCheckoutIntent();
  const now = new Date().toISOString();
  const intent: CheckoutIntent = stored
    ? { ...stored, lastUpdated: now }
    : {
        landingPage: window.location.pathname,
        timestamp: now,
        lastUpdated: now,
      };

  if (planPresent) {
    const plan = (params.get('plan') ?? '').trim();
    if (plan) {
      intent.plan = plan;
      const itemPriceId = PLAN_MAP[plan];
      if (itemPriceId) {
        intent.itemPriceId = itemPriceId;
      } else {
        // Unknown slug: drop any stale resolved ID so plan and itemPriceId stay in sync
        delete intent.itemPriceId;
        console.warn('[CH Checkout Intent] Unknown plan slug:', plan);
      }
    } else {
      // Empty plan param: explicit clear signal
      delete intent.plan;
      delete intent.itemPriceId;
    }
  }
  if (couponPresent) {
    const coupon = (params.get('coupon') ?? '').trim();
    if (coupon) {
      const normalized = coupon.toUpperCase();
      if (COUPON_REGEX.test(normalized)) {
        intent.coupon = normalized;
      } else {
        // Coupon param present but malformed: drop any stored coupon so a stale one
        // doesn't survive while we pretend nothing happened
        delete intent.coupon;
        console.warn('[CH Checkout Intent] Invalid coupon format, dropping any stored coupon:', coupon);
      }
    } else {
      // Empty coupon param: explicit clear signal
      delete intent.coupon;
    }
  }
  if (hasUtm) {
    // Clear all stored UTMs first so a partial new UTM set doesn't mix with stale ones
    UTM_PARAMS.forEach((k) => delete (intent as unknown as Record<string, string>)[k]);
    UTM_PARAMS.forEach((k) => {
      const v = params.get(k);
      if (v) (intent as unknown as Record<string, string>)[k] = v;
    });
  }

  try {
    localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent));
  } catch (err) {
    console.error('[CH Checkout Intent] Failed to store:', err);
  }
}

// --- Coupon UI suppressor (cosmetic) ---
// When the user arrived via a deep link with ?coupon=X, the Webflow form's
// "Apply Coupon" button calls the checkout worker which can't tell "validate"
// from "create subscription" and 500s with "Please provide your first name".
// The deep-link interceptor below applies the coupon at the real checkout POST
// anyway, so the Apply button is redundant noise. Hide the input + button when
// a coupon is staged, and show a clean confirmation notice instead.

function installCouponUISuppressor(): void {
  const intent = getStoredCheckoutIntent();
  if (!intent?.coupon) return;

  const trySuppress = (): boolean => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'));
    const couponInput = inputs.find((el) => {
      const placeholder = (el.placeholder || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const labelText = (el.labels?.[0]?.innerText || '').toLowerCase();
      return /coupon|promo|discount|code/.test(placeholder + ariaLabel + labelText);
    });
    if (!couponInput) return false;

    let row: HTMLElement | null = couponInput;
    for (let i = 0; i < 5 && row; i++) {
      if (row.parentElement && row.parentElement.querySelectorAll('input, button').length > row.querySelectorAll('input, button').length) {
        break;
      }
      row = row.parentElement;
    }
    if (!row) return false;

    if (row.dataset.chCouponSuppressed === 'true') return true;
    row.dataset.chCouponSuppressed = 'true';

    row.style.display = 'none';

    const notice = document.createElement('div');
    notice.setAttribute('data-ch-coupon-notice', 'true');
    notice.style.cssText = [
      'padding: 12px 16px',
      'margin: 12px 0',
      'border: 1px solid #d4af37',
      'background: #fff8e1',
      'border-radius: 6px',
      'font-family: inherit',
      'font-size: 14px',
      'color: #5d4e00',
    ].join(';');
    // Build with DOM APIs — never innerHTML — so a hostile coupon string can't
    // be injected as markup even though COUPON_REGEX would have caught it on
    // capture. Belt-and-braces.
    const strong = document.createElement('strong');
    strong.textContent = `Code ${intent.coupon} applied`;
    const rest = document.createTextNode(' · your discount will be reflected at checkout.');
    notice.appendChild(strong);
    notice.appendChild(rest);
    row.parentElement?.insertBefore(notice, row);
    return true;
  };

  if (trySuppress()) return;

  const observer = new MutationObserver(() => {
    if (trySuppress()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
}

// --- Checkout fetch interceptor ---
// Patches window.fetch so any POST to the v1/v2 checkout workers transparently
// gets `coupon_id` (from the stored intent) appended to the request body.
// On a successful subscription response, the stored intent is cleared so a
// stale coupon can't be re-applied later. Idempotent: only installs once.

const CHECKOUT_WORKER_HOSTS = [
  'catholic-herald-cloudflare-v2.it-548.workers.dev',
  'catholicherald.it-548.workers.dev',
];

function isCheckoutWorkerUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return CHECKOUT_WORKER_HOSTS.includes(u.host);
  } catch {
    return false;
  }
}

interface CheckoutPayload {
  payment_token?: unknown;
  plan_id?: unknown;
  coupon_id?: unknown;
  portal?: unknown;
  [k: string]: unknown;
}

function installCheckoutInterceptor(): void {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const w = window as unknown as { __chCheckoutInterceptorInstalled?: boolean };
  if (w.__chCheckoutInterceptorInstalled) return;
  w.__chCheckoutInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(
    ...args: Parameters<typeof originalFetch>
  ): Promise<Response> {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
    if (!url || !isCheckoutWorkerUrl(url)) {
      return originalFetch(...args);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST') {
      return originalFetch(...args);
    }

    let bodyText: string | null = null;
    try {
      if (init?.body && typeof init.body === 'string') {
        bodyText = init.body;
      } else if (input instanceof Request) {
        bodyText = await input.clone().text();
      }
    } catch {
      return originalFetch(...args);
    }
    if (!bodyText) {
      return originalFetch(...args);
    }

    let payload: CheckoutPayload | null = null;
    try {
      payload = JSON.parse(bodyText) as CheckoutPayload;
    } catch {
      return originalFetch(...args);
    }
    if (!payload || typeof payload !== 'object') {
      return originalFetch(...args);
    }
    if (payload.portal) {
      return originalFetch(...args);
    }
    const isPaidCheckout = !!payload.payment_token && !!payload.plan_id;
    if (!isPaidCheckout) {
      return originalFetch(...args);
    }

    const intent = getStoredCheckoutIntent();
    let modified = false;
    if (intent?.coupon && !payload.coupon_id) {
      payload.coupon_id = intent.coupon;
      modified = true;
    }
    if (intent?.itemPriceId && !payload.plan_id) {
      payload.plan_id = intent.itemPriceId;
      modified = true;
    }

    const newInit: RequestInit = modified
      ? {
          ...(init ?? {}),
          method: 'POST',
          headers: { ...(init?.headers ?? {}), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      : (init ?? {});

    const target = input instanceof Request ? input.url : input;
    const response = await originalFetch(target, newInit);

    try {
      if (response.ok) {
        const clone = response.clone();
        const data = await clone.json().catch(() => null);
        if (data && (data.createSubscription || data.tokens || data.success)) {
          clearCheckoutIntent();
        }
      }
    } catch {
      // Best effort — don't break the response chain
    }

    return response;
  };
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

async function callPaywallEndpoint(action: 'check' | 'consume') {
  const response = await fetch('https://catholic-herald-paywall.it-548.workers.dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: window.chUser?.email, action }),
  });

  const data = await response.json();

  UIHandler({ loggedIn: true, ...data });

  const counterEl = document.querySelector('.remaining-articles-count');
  if (counterEl && data.freeArticlesRemaining !== undefined) {
    counterEl.textContent = String(data.freeArticlesRemaining);
  }
}

async function consumeIfNew() {
  const storageKey = `paywall_counted_${window.location.pathname}`;
  if (!sessionStorage.getItem(storageKey)) {
    await callPaywallEndpoint('consume');
    sessionStorage.setItem(storageKey, '1');
  }
}

async function setupPaywallCheck() {
  if (document.body.getAttribute('is-free-article') === 'true') {
    return;
  }

  if (!window.chUser) {
    UIHandler({ loggedIn: false, showPaywall: true });
    return;
  }

  const closeCounterElem = document.querySelector<HTMLButtonElement>('.close-counter-popup');
  if (closeCounterElem) {
    closeCounterElem.addEventListener('click', () => {
      const counterEl = document.querySelector<HTMLDivElement>('.floating-paywall-counter');
      if (counterEl) {
        counterEl.style.transform = 'translateY(100%)';
        counterEl.style.opacity = '0';
      }
    });
  }

  // If article-ready already fired, consume immediately
  if (window.articleReady) {
    await consumeIfNew();
    return;
  }

  // Listen for article-ready event (only fires on article pages)
  document.addEventListener('article-ready', () => {
    consumeIfNew();
  });

  // Immediately do a status check (no decrement) for UI state
  await callPaywallEndpoint('check');
}

async function init() {
  // Capture deep-link checkout intent (plan, coupon, UTMs) before anything else
  // so the data survives Auth0 redirects, sign-up flows, and page navigation.
  captureCheckoutIntent();
  window.chCheckout = {
    get: getStoredCheckoutIntent,
    clear: clearCheckoutIntent,
    planMap: PLAN_MAP,
    resolveSlug: (slug: string) => PLAN_MAP[slug],
  };
  // Patch window.fetch so any POST to the checkout workers picks up the
  // stored coupon (and plan, if missing) without touching Webflow form code.
  installCheckoutInterceptor();
  // Hide the Webflow form's coupon input + Apply button when we've already
  // staged a coupon via deep link — Apply is bug-prone and redundant since the
  // fetch interceptor handles application server-side.
  installCouponUISuppressor();

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
        window.location.pathname + window.location.search
      )}`,
    },
  });

  window.auth0Client = client;

  let mode: 'auth0' | 'api' | '' = '';

  let claims;
  // check if user is logged in via Auth0
  let isLoggedIn = false;
  try {
    isLoggedIn = await client.isAuthenticated();
    if (isLoggedIn) {
      // check auth0 for user
      claims = await client.getIdTokenClaims();
      mode = 'auth0';
      document.dispatchEvent(new Event('is-logged-in'));
    } else {
      // check local storage for user
      claims = await getUser();
      isLoggedIn = !!claims;
      if (isLoggedIn === true) {
        mode = 'api';
        document.dispatchEvent(new Event('is-logged-in'));
      } else {
        document.dispatchEvent(new Event('not-logged-in'));
      }
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
  setupPaywallCheck();
  document.dispatchEvent(new Event('auth0-ready'));

  /**
   * Old Poool approach:
   */

  // Check custom subscriber claim
  // const claimKey = 'https://catholicherald.com/claims/subscriber';
  // const isSubscriber = claims?.[claimKey] === true;

  // const validSubscriptionTypes = [
  //   'catholic-herald-digital-only-GBP-Monthly',
  //   'catholic-herald-digital-only',
  //   'catholic-herald-digital-only-USD-Monthly',
  //   'catholic-herald-digital-only-USD-Yearly',
  //   'catholic-herald-digital-only-monthly',
  //   'catholic-herald-digital-only-monthly-euro',
  //   'catholic-herald-digital-only-quarterly',
  //   'catholic-herald-print--digital-GBP-Monthly',
  //   'catholic-herald-print-&-digital',
  //   'catholic-herald-print-Monthly-digital-USD',
  //   'catholic-herald-Annual-print-digital-USD',
  //   'catholic-herald-print-&-digital-europe-annual-euro',
  //   'catholic-herald-print-&-digital-europe-monthly',
  //   'catholic-herald-print-&-digital-europe-monthly-euro',
  //   'catholic-herald-print-&-digital-international-annual',
  //   'catholic-herald-print-&-digital-international-monthly',
  //   'catholic-herald-print-&-digital-monthly',
  //   'catholic-herald-print-&-digital-quarterly',
  //   'uk-digital-only-offer',
  //   'usa-catholic-herald-print-&-digital',
  //   'usa-catholic-herald-print-&-digital-monthly',
  //   'usa-catholic-herald-print-&-digital-quarterly',
  //   'usa-digital-only-annual',
  //   'usa-digital-only-monthly',
  //   'usa-digital-only-quarterly',
  //   'us-digital-only-offer',
  //   '3-Month-Digital-Deal-GBP',
  //   '3-Month-Digital-Deal-USD',
  //   'Catholic-Herald-Digital-3-Month-Offer-USD',
  //   'Catholic-Herald-Digital-3-Month-Offer-GBP',
  // ];

  // const claimKeyCatholic = 'https://catholicherald.com/claims/item_price_ids';

  // const planIds = Array.isArray(claims?.[claimKeyCatholic]) ? claims[claimKeyCatholic] : [];

  // const isCatholicSubscriber = planIds.some((id) =>
  //   validSubscriptionTypes.some((type) => id === type)
  // );

  // // Branch on subscription
  // if (isSubscriber && isCatholicSubscriber) {
  //   // Disable Poool SDK
  //   document.dispatchEvent(new Event('poool:disable'));
  //   document.querySelectorAll('#poool-widget,[data-poool]').forEach((el) => el.remove());
  // } else {
  //   document.dispatchEvent(new Event('no-subscription'));
  // }

  setUpLoginButtons(client, isLoggedIn, mode);

  document.querySelectorAll<HTMLAnchorElement>('[data-create-ch-account-btn]').forEach((btn) => {
    const currentHref = btn.href;
    const separator = currentHref.includes('?') ? '&' : '?';
    btn.href = currentHref + separator + 'redirect=' + encodeURIComponent(window.location.href);
  });

  await signInSetup(client);
}

init().catch((err) => console.error('[TS] ❗ init error', err));

function setUpLoginButtons(client: Auth0Client, isLoggedIn: boolean, mode: 'auth0' | 'api' | '') {
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
    window.location.href = '/sign-in?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
  });
  loginBtn.addEventListener('click', () => {
    window.location.href = '/sign-in?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
  });

  logoutBtnMobile.addEventListener('click', () => {
    localStorage.removeItem('ch_id_token');
    client.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  });
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('ch_id_token');
    client.logout({
      logoutParams: { returnTo: window.location.origin },
    });
  });
}

// Helper function to decode URL-safe base64 (base64url) used in JWT tokens
function base64UrlDecode(str: string): string {
  if (!str) {
    throw new Error('Cannot decode empty string');
  }
  // Replace URL-safe characters with standard base64 characters
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed (base64 strings must be multiples of 4)
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += '='.repeat(padLength);
  try {
    return atob(base64);
  } catch (err) {
    throw new Error(`Failed to decode base64: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// gets the user from the local storage token, or gets a new token if the old one is expired
async function getUser() {
  const token = localStorage.getItem('ch_id_token');
  if (!token) return undefined;
  const tokenData = JSON.parse(token);
  let user = JSON.parse(base64UrlDecode(tokenData.id_token.split('.')[1]));

  const timeNow = Math.floor(Date.now() / 1000); // current time in seconds
  if (timeNow >= user.exp) {
    const newToken = await refreshToken(tokenData.refresh_token);
    user = JSON.parse(base64UrlDecode(newToken.split('.')[1]));
    if (!user) return undefined;
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

  const WORKER_URL = 'https://ch-login.it-548.workers.dev/login';
  const returnLocation = new URLSearchParams(window.location.search).get('returnTo');
  const returnTo = returnLocation ?? (window.location.pathname === '/sign-in' ? '/' : window.location.pathname);

  // do this first as we sometimes show the google button on other pages.
  if (googleBtn) {
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

  // stop if we're not on the login page
  if (
    !signInBtn ||
    !emailInput ||
    !passwordInput ||
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

  signInBtn.addEventListener('click', async (e) => {
    e.preventDefault();
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
      try {
        errorFeedback.textContent = JSON.parse(data.error).error_description;
      } catch (err) {
        errorFeedback.textContent = data.error;
      }
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
    if (message.error) {
      errorFeedback.textContent = message.error;
      errorFeedback.style.display = 'block';
      loadingSpinner.style.display = 'none';
      emailInput.style.display = 'block';
      resetPasswordBtn.style.display = 'block';
      resetPasswordBackLink.style.display = 'block';
      return;
    }
    passwordResetConfirmation.textContent = message;
    passwordResetConfirmation.style.display = 'block';
    loadingSpinner.style.display = 'none';
  });
}

function setPortal(customer_id: string) {
  document.querySelector('[data-ch-portal]')?.addEventListener('click', (e) => {
    e.stopPropagation();

    $.ajax({
      url: 'https://catholic-herald-cloudflare-v2.it-548.workers.dev',
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

  const data = await res.json();
  return data;

  return null;
}

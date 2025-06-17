import { createAuth0Client } from '@auth0/auth0-spa-js';

const init = async () => {
  const client = await createAuth0Client({
    clientId: 'TBO0AGlXm0010MiIexjvSTgYdLcB6RCD',
    domain: 'the-catholic-herald.us.auth0.com',
    authorizationParams: {
      redirect_uri: 'https://the-catholic-herald-5d6c2-bedae55b34495.webflow.io/',
      audience: 'https://authenticate.thecatholicherald.com',
    },
  });

  console.log("We're in");

  const url = new URLSearchParams(window.location.search);
  const code = url.get('code');
  if (code) {
    await client.handleRedirectCallback();
    history.replaceState({}, document.title, window.location.origin + window.location.pathname);
  }

  const claims = await client.getIdTokenClaims();
  const isSubscriber: boolean = claims?.['https://catholicherald.com/claims/subscriber'] === true;

  if (isSubscriber) {
    console.log(isSubscriber);
    /* Disable Poool completely */
    (window as any).poool = () => {
      /* no-op queue */
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

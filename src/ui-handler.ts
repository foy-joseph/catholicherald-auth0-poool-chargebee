export function UIHandler(props: {
  loggedIn: boolean;
  showPaywall: boolean;
  freeArticlesRemaining?: number;
  freeArticlesTimestamp?: string;
  hasPaidAccess?: boolean;
}) {
  console.log('UIHandler', props);

  // if not logged in, show subscription CTA
  if (props.loggedIn !== true) {
    const paywallEl = document.querySelector<HTMLDivElement>('[data-paywall-container]');
    if (paywallEl) {
      paywallEl.style.pointerEvents = 'auto';
      paywallEl.style.opacity = '1';
      paywallEl.style.height = 'auto';
      truncateRichText();
    }
  }

  if (props.loggedIn === true) {
    const floatingPaywallCounterEl = document.querySelector<HTMLDivElement>(
      '.floating-paywall-counter'
    );
    if (!floatingPaywallCounterEl) {
      return;
    }

    if (props.showPaywall === true) {
      const counterHeadings = document.querySelectorAll<HTMLHeadingElement>(
        '.free-articles-remaining-heading'
      );

      const counterSubHeadings = document.querySelectorAll<HTMLHeadingElement>(
        '.paywall-description-fixed'
      );

      const counterButtons = document.querySelectorAll<HTMLButtonElement>(
        '[data-create-ch-account-btn]'
      );

      counterHeadings.forEach((counterHeading) => {
        counterHeading.textContent = "You've reached your free article limit";
      });
      counterSubHeadings.forEach((counterSubHeading) => {
        counterSubHeading.textContent = 'Subscribe to continue reading and enjoy unlimited access.';
      });
      counterButtons.forEach((counterButton) => {
        counterButton.textContent = 'Subscribe';
      });
    }

    floatingPaywallCounterEl.style.transform = 'translateY(0)';
    floatingPaywallCounterEl.style.opacity = '1';
  }
}

function truncateRichText() {
  const richText = document.querySelector<HTMLDivElement>('.article_rich_text .w-richtext');
  if (!richText) return;

  const children = Array.from(richText.children);
  const maxChars = 500;
  let charCount = 0;
  let exceeded = false;

  children.forEach((child) => {
    if (exceeded) {
      child.remove();
    } else {
      charCount += child.textContent.length;
      if (charCount >= maxChars) {
        exceeded = true;
      }
    }
  });
}

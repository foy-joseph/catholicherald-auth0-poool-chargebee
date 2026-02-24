export function UIHandler(props: { loggedIn: boolean; showPaywall: boolean }) {
  console.log('UIHandler', props);

  // if not logged in, show subscription CTA
  if (props.loggedIn !== true) {
    const paywallEl = document.querySelector<HTMLDivElement>('.article-paywall-wrapper');
    if (paywallEl) {
      paywallEl.style.display = 'block';
      truncateRichText();
    }
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

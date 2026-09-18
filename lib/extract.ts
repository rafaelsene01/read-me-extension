/**
 * Collapse runs of whitespace inside each line, drop blank lines and keep the
 * line breaks between them, which is what segmentBlock() reads as paragraphs.
 */
function normalize(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Text currently selected in the page, or an empty string when nothing is selected. */
export function extractFromSelection(doc: Document): string {
  return normalize(doc.getSelection()?.toString() ?? '');
}

/**
 * Text of an element as the user sees it. innerText already renders block
 * children on their own lines; textContent covers nodes without it (SVG).
 */
export function extractFromElement(el: Element): string {
  return normalize((el as HTMLElement).innerText ?? el.textContent ?? '');
}

/** Language declared by the page, falling back to the browser language. */
export function pageLang(doc: Document): string {
  return doc.documentElement.lang.trim() || navigator.language;
}

/**
 * The two regions the picker cannot read: an iframe whose document belongs to
 * another origin, and a closed shadow root. chrome.dom.openOrClosedShadowRoot
 * sees the closed root that el.shadowRoot hides; outside a content script the
 * API is absent and only the iframe check applies.
 */
export function isInaccessible(el: Element): boolean {
  if (el.tagName === 'IFRAME') {
    try {
      return (el as HTMLIFrameElement).contentDocument === null;
    } catch {
      // Reading contentDocument across origins throws instead of returning null.
      return true;
    }
  }
  return el.shadowRoot === null && chrome.dom?.openOrClosedShadowRoot(el as HTMLElement) != null;
}

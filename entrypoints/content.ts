import { extractFromElement, extractFromSelection, isInaccessible, pageLang } from '../lib/extract';
import { isCommand } from '../lib/messages';

/** What a capture sends back to whoever asked for it. */
export interface CapturePayload {
  text: string;
  url: string;
  title: string;
  lang: string;
  /** Set when the picked element sits in a region a content script cannot read. */
  inaccessible?: true;
}

const OUTLINE_STYLE = [
  'position:fixed',
  'z-index:2147483647',
  'pointer-events:none',
  'box-sizing:border-box',
  'border:2px solid #2563eb',
  'background:rgba(37,99,235,0.12)',
  'top:0',
  'left:0',
  'width:0',
  'height:0',
].join(';');

function payload(text: string): CapturePayload {
  return {
    text,
    url: location.href,
    title: document.title,
    lang: pageLang(document),
  };
}

/** Outlines the element under the pointer. Resolves with the capture, or null on Escape. */
function pickElement(): Promise<CapturePayload | null> {
  return new Promise((resolve) => {
    const outline = document.createElement('div');
    outline.style.cssText = OUTLINE_STYLE;
    document.body.append(outline);
    let target: Element | null = null;

    const over = (event: MouseEvent): void => {
      const element = event.target;
      if (!(element instanceof Element) || element === outline) return;
      target = element;
      const box = element.getBoundingClientRect();
      outline.style.top = `${box.top}px`;
      outline.style.left = `${box.left}px`;
      outline.style.width = `${box.width}px`;
      outline.style.height = `${box.height}px`;
    };

    const click = (event: MouseEvent): void => {
      // The page must not follow the link the user clicked to capture.
      event.preventDefault();
      event.stopPropagation();
      if (target && isInaccessible(target)) {
        finish({ ...payload(''), inaccessible: true });
        return;
      }
      finish(payload(target ? extractFromElement(target) : ''));
    };

    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish(null);
    };

    function finish(result: CapturePayload | null): void {
      document.removeEventListener('mouseover', over, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      outline.remove();
      resolve(result);
    }

    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
  });
}

export default defineContentScript({
  // No `matches` on purpose: with runtime registration and no match pattern the
  // script stays out of the manifest and adds no host permission. It is injected
  // per tab by scripting.executeScript once the user grants access.
  registration: 'runtime',

  main() {
    const scope = globalThis as unknown as { __ttsReaderCaptureReady?: boolean };
    // executeScript runs this file again on every capture; listen only once.
    if (scope.__ttsReaderCaptureReady) return;
    scope.__ttsReaderCaptureReady = true;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isCommand(message) || message.type !== 'capture') return false;

      if (message.mode === 'selection') {
        // Selection mode reads what is already selected; no overlay.
        sendResponse(payload(extractFromSelection(document)));
        return false;
      }

      void pickElement().then(sendResponse);
      return true;
    });
  },
});

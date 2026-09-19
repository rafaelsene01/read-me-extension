import type { CapturePayload } from '../entrypoints/content';
import type { CaptureMode, Command } from './messages';
import { segmentBlock } from './segment';
import { appendBlock } from './storage';
import type { Block } from './types';

/** Built by WXT from entrypoints/content.ts; never registered in the manifest. */
const CONTENT_SCRIPT = 'content-scripts/content.js';

const WEB_STORE = [
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
];

export type CaptureFailure =
  | 'unsupported'
  | 'denied'
  | 'inaccessible'
  | 'cancelled'
  | 'empty'
  | 'full'
  | 'quota';

export type CaptureResult = { ok: true; block: Block } | { ok: false; reason: CaptureFailure };

/** Pages the browser refuses to inject into: internal schemes and the web stores. */
export function isCapturable(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return !WEB_STORE.includes(parsed.hostname);
}

/** Approximate match-pattern test; only drives the UI hint, permissions.request decides. */
function matchesUrl(pattern: string, url: string): boolean {
  if (pattern === '<all_urls>') return true;
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${source}$`).test(url);
}

export function needsPermission(url: string, granted: string[]): boolean {
  return !granted.some((pattern) => matchesUrl(pattern, url));
}

export function originPattern(url: string): string {
  return `${new URL(url).origin}/*`;
}

// SPEC_DEVIATION: design.md declares requestAndCapture(tabId, mode). The tab url
// is a third parameter.
// Reason: spec P1-A AC7 requires permissions.request to run inside the click
// task. Reading the url here (chrome.tabs.get) would await before the request
// and Chrome would then reject it for missing user activation.
export async function requestAndCapture(
  tabId: number,
  url: string,
  mode: CaptureMode,
): Promise<CaptureResult> {
  if (!isCapturable(url)) return { ok: false, reason: 'unsupported' };

  // First await of the function: the user gesture is still alive here. Already
  // granted origins resolve true without prompting.
  const granted = await chrome.permissions.request({ origins: [originPattern(url)] });
  if (!granted) return { ok: false, reason: 'denied' };
  return captureTab(tabId, mode);
}

/**
 * Injects the content script and stores what it captures. The caller must
 * already hold access to the tab: a host permission, or activeTab granted by a
 * user gesture such as the context menu.
 */
export async function captureTab(
  tabId: number,
  mode: CaptureMode,
): Promise<CaptureResult> {
  let payload: CapturePayload | null;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    const command: Command = { type: 'capture', mode };
    payload = (await chrome.tabs.sendMessage(tabId, command)) as CapturePayload | null;
  } catch {
    return { ok: false, reason: 'inaccessible' };
  }

  // The picker was closed with Escape.
  if (!payload) return { ok: false, reason: 'cancelled' };
  if (payload.inaccessible) return { ok: false, reason: 'inaccessible' };
  if (!payload.text) return { ok: false, reason: 'empty' };

  const id = crypto.randomUUID();
  const block: Block = {
    id,
    sourceUrl: payload.url,
    sourceTitle: payload.title,
    lang: payload.lang,
    text: payload.text,
    paragraphs: segmentBlock(payload.text, payload.lang, id),
    createdAt: Date.now(),
  };

  const appended = await appendBlock(block);
  if (!appended.ok) return { ok: false, reason: appended.reason };
  return { ok: true, block };
}

const OFFSCREEN_URL = 'offscreen.html';

let creating: Promise<boolean> | null = null;

/**
 * The offscreen document owns everything the service worker cannot do: DOM,
 * AudioContext playback and the inference worker. It is created on demand for
 * the first neural synthesis and closes itself after a few idle minutes.
 * Resolves true when it had to be created (so nothing is loaded in it yet).
 */
export function ensureOffscreen(): Promise<boolean> {
  // Only one offscreen document may exist: concurrent callers share one creation.
  creating ??= (async () => {
    if (await chrome.offscreen.hasDocument()) return false;
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL(OFFSCREEN_URL),
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.WORKERS],
      justification: 'Reprodução de áudio e inferência de voz neural local',
    });
    return true;
  })().finally(() => {
    creating = null;
  });
  return creating;
}

export async function hasOffscreen(): Promise<boolean> {
  return chrome.offscreen.hasDocument();
}

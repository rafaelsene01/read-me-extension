/**
 * Keeping the sentence being read in view. The browser's own
 * `scrollIntoView({ behavior: 'smooth' })` scrolls on every sentence and has no
 * say over how long it takes; this scrolls only when the sentence has left the
 * comfortable middle of the view, and animates it over `duration`.
 */

export interface View {
  /** Top of the visible area, in viewport coordinates. */
  top: number;
  /** Bottom of the visible area, in viewport coordinates. */
  bottom: number;
  scrollTop: number;
}

export interface Box {
  top: number;
  bottom: number;
}

/**
 * The scrollTop that centres `box` in `view`, or null when it already sits
 * comfortably inside it. A box taller than the view is aligned to the top
 * instead, since centring it would hide its beginning.
 */
export function scrollTargetFor(view: View, box: Box): number | null {
  const height = view.bottom - view.top;
  // The comfortable band is the middle 40% of the view: the reading stays near
  // the centre instead of drifting down to the edge before the view follows.
  const comfort = height * 0.3;
  if (box.top >= view.top + comfort && box.bottom <= view.bottom - comfort) return null;

  const offset =
    box.bottom - box.top > height - comfort * 2
      ? // Taller than the band: centring it would hide its beginning, so its top
        // goes just under the top of the view.
        box.top - view.top - height * 0.15
      : (box.top + box.bottom) / 2 - (view.top + view.bottom) / 2;
  return Math.max(0, view.scrollTop + offset);
}

/**
 * Every ancestor that actually scrolls, innermost first, crossing out of a
 * shadow root. The page itself closes the list: a sentence inside a scroll box
 * needs the box AND the page moved, which is what scrollIntoView does natively.
 */
function scrollersOf(element: Element): Element[] {
  const page = document.scrollingElement ?? document.documentElement;
  const scrollers: Element[] = [];
  let node: Element | null = element;

  while (node) {
    const root = node.getRootNode();
    const parent: Element | null =
      node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    if (!parent) break;
    const { overflowY } = getComputedStyle(parent);
    if (/auto|scroll|overlay/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      scrollers.push(parent);
    }
    node = parent;
  }

  if (!scrollers.includes(page)) scrollers.push(page);
  return scrollers;
}

function viewOf(scroller: Element): View {
  const page = scroller === (document.scrollingElement ?? document.documentElement);
  if (page) return { top: 0, bottom: window.innerHeight, scrollTop: scroller.scrollTop };
  const rect = scroller.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, scrollTop: scroller.scrollTop };
}

/** The animation in flight per scroller, so a new sentence replaces the old one. */
const running = new WeakMap<Element, () => void>();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function animate(scroller: Element, to: number, duration: number): void {
  running.get(scroller)?.();

  const from = scroller.scrollTop;
  const target = Math.max(0, Math.min(to, scroller.scrollHeight - scroller.clientHeight));
  const distance = target - from;
  if (Math.abs(distance) < 1) return;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scroller.scrollTop = target;
    return;
  }

  let frame = 0;
  const start = performance.now();
  const stop = (): void => {
    cancelAnimationFrame(frame);
    running.delete(scroller);
    removeEventListener('wheel', stop);
    removeEventListener('touchstart', stop);
  };

  const step = (now: number): void => {
    const progress = Math.min(1, (now - start) / duration);
    scroller.scrollTop = from + distance * easeInOutCubic(progress);
    if (progress < 1) frame = requestAnimationFrame(step);
    else stop();
  };

  running.set(scroller, stop);
  // Scrolling by hand wins: the reading stops dragging the view around.
  addEventListener('wheel', stop, { passive: true });
  addEventListener('touchstart', stop, { passive: true });
  frame = requestAnimationFrame(step);
}

/**
 * Bring `element` to the middle of its scroll container, smoothly, and only
 * when it is not already comfortably in view.
 */
export function revealElement(element: Element, duration = 600): void {
  // The box to bring into view is the element for its own scroll box, then that
  // box for the next one out: the same walk scrollIntoView does.
  let box = element.getBoundingClientRect();
  for (const scroller of scrollersOf(element)) {
    const target = scrollTargetFor(viewOf(scroller), { top: box.top, bottom: box.bottom });
    if (target !== null) animate(scroller, target, duration);
    box = scroller.getBoundingClientRect();
  }
}

import { describe, expect, it } from 'vitest';
import { scrollTargetFor } from './scroll';

/** A 600px tall view, scrolled to 1000: the comfortable band is its middle, 180..420. */
const view = { top: 0, bottom: 600, scrollTop: 1000 };

describe('scrollTargetFor', () => {
  it('does not scroll a box already in the comfortable middle', () => {
    expect(scrollTargetFor(view, { top: 200, bottom: 260 })).toBeNull();
  });

  it('centres a box below the comfortable area', () => {
    // Centre is 830, the view's centre is 300: scroll 530 further down.
    expect(scrollTargetFor(view, { top: 800, bottom: 860 })).toBe(1530);
  });

  it('centres a box above the comfortable area', () => {
    // Centre is -70, the view's centre is 300: scroll 370 back up.
    expect(scrollTargetFor(view, { top: -100, bottom: -40 })).toBe(630);
  });

  it('scrolls for a box that only just enters the margin', () => {
    expect(scrollTargetFor(view, { top: 60, bottom: 100 })).not.toBeNull();
  });

  it('scrolls for a box that is visible but below the middle band', () => {
    // The reading must not drift down to the edge of the view before it follows.
    expect(scrollTargetFor(view, { top: 500, bottom: 560 })).toBe(1230);
  });

  it('aligns a box taller than the view to the top, under the margin', () => {
    expect(scrollTargetFor(view, { top: 300, bottom: 1300 })).toBe(1210);
  });

  it('never asks for a negative scrollTop', () => {
    expect(scrollTargetFor({ top: 0, bottom: 600, scrollTop: 0 }, { top: -500, bottom: -440 })).toBe(
      0,
    );
  });

  it('measures against the view when it is a scroll box, not the page', () => {
    // A scroll box from 100 to 700: its comfortable area is 180..620.
    expect(scrollTargetFor({ top: 100, bottom: 700, scrollTop: 50 }, { top: 300, bottom: 360 })).toBeNull();
  });
});

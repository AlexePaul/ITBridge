import { describe, expect, it } from "vitest";
import { scrollEdges, scrollLeftToReveal } from "~/composables/useScrollEdges";

/**
 * The portal's tab strip scrolls sideways on a phone, and nothing said so: at 390 px „Plăți" and
 * „Profil" sat past the right edge with no hint (QA of 27 September 2026). The strip fades on the
 * side that has more to show; this is the reading that decides which side.
 */
describe("scrollEdges", () => {
  it("says nothing when every tab fits", () => {
    expect(scrollEdges(0, 358, 358)).toEqual({ before: false, after: false });
  });

  it("says there is more to the right at the start of a strip wider than the screen", () => {
    expect(scrollEdges(0, 520, 358)).toEqual({ before: false, after: true });
  });

  it("says there is more on both sides in the middle", () => {
    expect(scrollEdges(80, 520, 358)).toEqual({ before: true, after: true });
  });

  it("says there is more to the left once scrolled to the end", () => {
    expect(scrollEdges(162, 520, 358)).toEqual({ before: true, after: false });
  });

  it("does not fade over the half pixel a zoomed phone leaves at either end", () => {
    expect(scrollEdges(161.5, 520, 358)).toEqual({ before: true, after: false });
    expect(scrollEdges(0.5, 520, 358)).toEqual({ before: false, after: true });
  });
});

/**
 * The current tab is brought into view by scrolling the row alone. `scrollIntoView` moved the whole
 * page as well: `html` has a `scroll-padding-top` for the sticky header, and a tab inside that header
 * can never get below it, so every change of tab pulled the page up by the difference.
 */
describe("scrollLeftToReveal", () => {
  const row = { scrollLeft: 0, clientWidth: 358, scrollWidth: 520 };

  it("leaves the row alone when the tab is already in view, clear of the fade", () => {
    expect(scrollLeftToReveal(row, { start: 80, end: 150 }, 32)).toBe(0);
  });

  it("scrolls just far enough to bring a tab past the right edge in, clear of the fade", () => {
    // „Plăți", from 400 to 440 in the row: its end plus the fade, less the row's width.
    expect(scrollLeftToReveal(row, { start: 400, end: 440 }, 32)).toBe(114);
  });

  it("scrolls back for a tab past the left edge", () => {
    expect(scrollLeftToReveal({ ...row, scrollLeft: 150 }, { start: 60, end: 120 }, 32)).toBe(28);
  });

  it("never scrolls past either end of the row", () => {
    expect(scrollLeftToReveal(row, { start: 480, end: 520 }, 32)).toBe(162);
    expect(scrollLeftToReveal({ ...row, scrollLeft: 100 }, { start: 0, end: 50 }, 32)).toBe(0);
  });
});

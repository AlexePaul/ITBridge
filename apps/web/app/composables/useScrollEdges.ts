/**
 * Which ends of a sideways-scrolling row still hide something — read from the row's own numbers.
 *
 * The portal's tabs scroll on a phone rather than wrap (E18 S4), and at 390 px „Plăți" and „Profil"
 * sat past the right edge with nothing to say they were there (QA of 27 September 2026). The row
 * fades on the side this names. A pixel of slack at each end: a zoomed phone leaves a fraction of a
 * pixel between `scrollLeft` and the last position, and a fade over a row already scrolled to its
 * end would say there is more when there is not.
 */
export const scrollEdges = (
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number
): { before: boolean; after: boolean } => ({
  before: scrollLeft > 1,
  after: scrollLeft < scrollWidth - clientWidth - 1,
});

/**
 * Where to scroll a row so one item in it is in view, `margin` clear of either edge, moving no
 * further than that. `start` and `end` are the item's edges in the row's own coordinates.
 *
 * The row alone, not `scrollIntoView`: `html` carries a `scroll-padding-top` for the sticky header,
 * and a tab inside that header can never get below it — so `scrollIntoView` pulled the whole page up
 * by the difference on every change of tab.
 */
export const scrollLeftToReveal = (
  row: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  item: { start: number; end: number },
  margin: number
): number => {
  let left = row.scrollLeft;
  if (item.start - margin < left) left = item.start - margin;
  else if (item.end + margin > left + row.clientWidth) left = item.end + margin - row.clientWidth;
  return Math.min(Math.max(0, row.scrollWidth - row.clientWidth), Math.max(0, left));
};

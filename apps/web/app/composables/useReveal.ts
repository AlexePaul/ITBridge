import { onBeforeUnmount, onMounted, nextTick } from "vue";

/**
 * Blocks marked with `data-reveal` rise into place as they scroll in, blocks
 * marked with `data-reveal-children` bring their items in one after another,
 * and every `hr.rule` on the page is struck from left to right — the last one
 * without a page having to ask for it. The hiding rules live behind the
 * `reveal-on` class this sets on <html>, so a page whose JavaScript never runs
 * shows its content instead of an empty column.
 *
 * The hero of a page is not on this observer: it carries `data-intro` and
 * animates from first paint, in CSS alone.
 */
const SELECTOR = "[data-reveal], [data-reveal-children], hr.rule";

export const useReveal = () => {
  let observer: IntersectionObserver | undefined;

  onMounted(async () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Nothing here degrades gracefully without the observer: `reveal-on` would
    // hide every block below the fold and nothing would ever bring one back.
    if (typeof IntersectionObserver === "undefined") return;

    let batch = 0;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;

    const reveal = (element: HTMLElement) => {
      observer?.unobserve(element);
      // Read by the stylesheet, which adds the per-item stagger of a
      // `data-reveal-children` grid on top of it.
      element.style.setProperty("--reveal-delay", `${Math.min(batch, 4) * 100}ms`);
      batch += 1;
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        batch = 0;
      }, 250);
      element.classList.add("is-revealed");
    };

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // reveal on entering the lower edge, or if already scrolled past
          if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
            reveal(entry.target as HTMLElement);
          }
        }
      },
      // fires slightly before the element enters, so the reveal is already playing
      { threshold: 0, rootMargin: "0px 0px 6% 0px" }
    );

    await nextTick();
    // One frame past nextTick, because on a client-side navigation the router
    // resets the scroll position after the component mounts. Measured in the
    // same tick, every element on the incoming page still carries the previous
    // page's offset — usually a large negative `top` — so all of them looked
    // on-screen and the whole page skipped its reveal.
    await new Promise(requestAnimationFrame);

    // Only now, with the observer built and the pass about to run: the class is
    // what hides the page, so anything that could throw ahead of it — the media
    // query, the observer's own constructor — has to throw while the page is
    // still fully painted. Measuring before it costs nothing, because opacity
    // does not move anything.
    document.documentElement.classList.add("reveal-on");

    document.querySelectorAll<HTMLElement>(SELECTOR).forEach((element) => {
      // Whatever is already on screen has been painted opaque since first
      // paint; adding `reveal-on` would hide it and fade it back in, so every
      // page opened with a visible blink of its own hero. Mark those revealed
      // without an animation and observe only what is still below the fold.
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        element.classList.add("is-revealed", "reveal-instant");
        return;
      }
      observer?.observe(element);
    });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = undefined;
    document.documentElement.classList.remove("reveal-on");
  });
};

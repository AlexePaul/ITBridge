import { onBeforeUnmount, onMounted, nextTick } from "vue";

/**
 * Blocks marked with `data-reveal` rise into place as they scroll in, with a
 * small stagger for the ones entering together. The hiding rule lives behind
 * the `reveal-on` class this sets on <html>, so a page whose JavaScript never
 * runs shows its content instead of an empty column.
 */
export const useReveal = () => {
  let observer: IntersectionObserver | undefined;

  onMounted(async () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    document.documentElement.classList.add("reveal-on");

    let batch = 0;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;

    const reveal = (element: HTMLElement) => {
      observer?.unobserve(element);
      element.style.animationDelay = `${Math.min(batch, 4) * 100}ms`;
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
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((element) => {
      // Whatever is already on screen has been painted opaque since first
      // paint; adding `reveal-on` would hide it and fade it back in, so every
      // page opened with a visible blink of its own hero. Mark those revealed
      // without an animation and observe only what is still below the fold.
      if (element.getBoundingClientRect().top < window.innerHeight) {
        element.classList.add("is-revealed");
        element.style.animation = "none";
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

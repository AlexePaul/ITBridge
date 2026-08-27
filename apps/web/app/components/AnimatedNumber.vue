<template>
  <span ref="root" class="counter">
    <span class="counter-ghost" :data-value="value" aria-hidden="true"></span>
    <span class="counter-value">{{ display }}</span>
  </span>
</template>

<script setup lang="ts">
// The ghost span holds the width open so a figure growing from one digit to
// three cannot nudge the layout while it counts. Its text is drawn with CSS
// `content: attr(data-value)`, not as a text node, so the page never reads
// "350 lei 350 lei" to a crawler or a screen reader.
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{ value: string; duration?: number }>(), {
  duration: 1100,
});

const root = ref<HTMLElement | null>(null);
// Rendered whole on the server and until the count starts, so a reader without
// JavaScript — or one who asked for less motion — sees the figure itself.
const display = ref(props.value);

let observer: IntersectionObserver | undefined;
let frame = 0;

// Every run of digits counts up on the same clock, so "6–8" fills in together
// and "1,5" keeps its decimal.
const parts = props.value.split(/(\d+(?:[.,]\d+)?)/);

const render = (progress: number) =>
  parts
    .map((part, index) => {
      if (index % 2 === 0) return part;
      const separator = part.includes(",") ? "," : ".";
      const decimals = part.split(/[.,]/)[1]?.length ?? 0;
      const value = (Number(part.replace(",", ".")) * progress).toFixed(decimals);
      return decimals ? value.replace(".", separator) : value;
    })
    .join("");

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const count = (start: number) => {
  const elapsed = performance.now() - start;
  const progress = Math.min(elapsed / props.duration, 1);
  display.value = progress === 1 ? props.value : render(easeOut(progress));
  if (progress < 1) frame = requestAnimationFrame(() => count(start));
};

onMounted(() => {
  if (!root.value) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Anything already on screen counts straight away. Zeroing every figure and
  // then waiting for the 0.4 threshold leaves one that is on screen but only
  // partly visible — and never scrolled further — reading "0" for good, which
  // on /cursuri is the price. A figure that never animated beats a wrong one.
  const rect = root.value.getBoundingClientRect();
  display.value = render(0);

  if (rect.top < window.innerHeight && rect.bottom > 0) {
    count(performance.now());
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting && entry.boundingClientRect.bottom >= 0) continue;
        observer?.disconnect();
        count(performance.now());
      }
    },
    { threshold: 0.4 }
  );
  observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
});
</script>

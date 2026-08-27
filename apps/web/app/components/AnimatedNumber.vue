<template>
  <span ref="root" class="counter">
    <!-- The final text holds the width open, so a figure growing from one digit
         to three cannot nudge the layout while it counts. -->
    <span class="counter-ghost" aria-hidden="true">{{ value }}</span>
    <span class="counter-value">{{ display }}</span>
  </span>
</template>

<script setup lang="ts">
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

  display.value = render(0);

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

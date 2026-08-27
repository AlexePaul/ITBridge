<template>
  <div>
    <figure
      class="plate slideshow"
      role="group"
      aria-roledescription="carusel"
      :aria-label="label"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <img
        v-for="(photo, index) in photos"
        :key="photo.src"
        :src="photo.src"
        :alt="photo.alt"
        class="slide"
        :class="{ 'is-current': index === current, 'is-previous': index === previous }"
        :loading="index === 0 ? 'eager' : 'lazy'"
        :aria-hidden="index === current ? undefined : 'true'"
      />
    </figure>

    <div class="slideshow-controls">
      <button
        type="button"
        class="btn btn-secondary btn-icon"
        :aria-label="
          isPlaying ? 'Oprește derularea fotografiilor' : 'Pornește derularea fotografiilor'
        "
        @click="isPlaying = !isPlaying"
      >
        <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="size-4" />
      </button>
      <div class="dots">
        <button
          v-for="(photo, index) in photos"
          :key="photo.src"
          type="button"
          class="dot"
          :aria-current="index === current ? 'true' : undefined"
          :aria-label="`Fotografia ${index + 1} din ${photos.length}`"
          @click="jumpTo(index)"
        ></button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    photos: { src: string; alt: string }[];
    label: string;
    interval?: number;
  }>(),
  { interval: 5000 }
);

const current = ref(0);
// The outgoing photograph stays behind the incoming one instead of fading out
// with it, so a transition interrupted mid-way (a backgrounded tab throttles
// them) never leaves an empty plate.
const previous = ref(-1);
const isPlaying = ref(true);
const isHovered = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const stop = () => {
  clearInterval(timer);
  timer = undefined;
};

const start = () => {
  stop();
  timer = setInterval(() => {
    if (!isHovered.value) show((current.value + 1) % props.photos.length);
  }, props.interval);
};

// Advancing on its own is motion the reader did not ask for: the pause control
// is always there, and a reader who asked for less motion never gets it going.
onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    isPlaying.value = false;
    return;
  }
  start();
});

watch(isPlaying, (playing) => (playing ? start() : stop()));

onBeforeUnmount(stop);

const jumpTo = (index: number) => {
  show(index);
  if (isPlaying.value) start();
};

function show(index: number) {
  if (index === current.value) return;
  previous.value = current.value;
  current.value = index;
}
</script>

<template>
  <div @keydown.left.prevent="jumpTo(previousIndex)" @keydown.right.prevent="jumpTo(nextIndex)">
    <figure
      class="plate slideshow"
      role="group"
      aria-roledescription="carusel"
      :aria-label="label"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <img
        v-for="(photo, index) in photos"
        :key="photo.src"
        :src="photo.src"
        :alt="photo.alt"
        class="slide"
        :class="{ 'is-current': index === current }"
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

      <button
        type="button"
        class="btn btn-secondary btn-icon"
        aria-label="Fotografia anterioară"
        @click="jumpTo(previousIndex)"
      >
        <UIcon name="i-lucide-chevron-left" class="size-4" />
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

      <button
        type="button"
        class="btn btn-secondary btn-icon"
        aria-label="Fotografia următoare"
        @click="jumpTo(nextIndex)"
      >
        <UIcon name="i-lucide-chevron-right" class="size-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    photos: { src: string; alt: string }[];
    label: string;
    interval?: number;
  }>(),
  { interval: 5000 }
);

const current = ref(0);
const isPlaying = ref(true);
const isHovered = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

const nextIndex = computed(() => (current.value + 1) % props.photos.length);
const previousIndex = computed(
  () => (current.value - 1 + props.photos.length) % props.photos.length
);

function show(index: number) {
  current.value = index;
}

const stop = () => {
  clearInterval(timer);
  timer = undefined;
};

const start = () => {
  stop();
  timer = setInterval(() => {
    if (!isHovered.value) show(nextIndex.value);
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

// Reaching a photograph by hand restarts the clock, so it does not slide away
// a moment after it was asked for.
const jumpTo = (index: number) => {
  show(index);
  if (isPlaying.value) start();
};

let touchStartX = 0;

const onTouchStart = (event: TouchEvent) => {
  touchStartX = event.changedTouches[0]?.clientX ?? 0;
};

const onTouchEnd = (event: TouchEvent) => {
  const distance = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
  if (Math.abs(distance) < 40) return;
  jumpTo(distance < 0 ? nextIndex.value : previousIndex.value);
};
</script>

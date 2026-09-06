<template>
  <!-- A real picture: matted, like every other photograph on the site. -->
  <figure v-if="objectUrl" class="project-plate">
    <img :src="objectUrl" :alt="alt" loading="lazy" />
  </figure>

  <!--
    No picture: not a smaller frame with a hole in it, but a different shape — the file's own mark
    set over a rule. Thumbnailing is allowed to fail and a `.sb3` has none at all until E14/S3b, so
    this is the common case in a gallery that is supposed to feel celebratory. A grey box would read
    as something that failed to load.
  -->
  <figure v-else-if="framed" class="project-plate">
    <div class="project-glyph" aria-hidden="true">{{ glyph }}</div>
  </figure>
  <div v-else class="project-mark" aria-hidden="true">{{ glyph }}</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useProjectsApi } from "~/composables/api/useProjectsApi";

/**
 * One project's thumbnail — or, far more often, what stands in for one.
 *
 * A component rather than an `<img>` because the bytes need the bearer token, which a browser will
 * not attach to an image request. They are fetched like any other call and handed over as a blob
 * URL — which this component then owns, and revokes when it goes away. Without the revoke, a gallery
 * scrolled through a term's work would hold every picture it had ever shown.
 *
 * The placeholder is drawn from the file's own kind rather than being one generic icon: a page of
 * code, a web page and a Scratch project are different things a child made, and a gallery where
 * every second item is the same grey square says nothing about any of them.
 */
const props = withDefaults(
  defineProps<{
    projectId: number;
    hasThumbnail: boolean;
    alt?: string;
    /** The first file's name, or the project's title — whatever hints at what kind of work it is. */
    hint?: string;
    /** Whether the placeholder gets the mat too. Off in dense lists, on in the gallery. */
    framed?: boolean;
  }>(),
  { alt: "Miniatura lucrării", hint: "", framed: true }
);

const { fetchThumbnail } = useProjectsApi();
const objectUrl = ref<string | null>(null);

/**
 * The mark that stands in for a missing picture.
 *
 * Typographic, not an icon set: the system sets everything in the serif, and these are drawn at 56px
 * where an icon would look pasted on.
 */
const glyph = computed(() => {
  const hint = props.hint.toLowerCase();
  if (/\.(sb3|sb2|mp4|mov|webm)$/.test(hint)) return "▶";
  if (/\.(html?|css)$/.test(hint)) return "❦";
  if (/\.(py|js|ts|cpp|c|lua)$/.test(hint)) return "{ }";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(hint)) return "◫";
  if (/\.zip$/.test(hint)) return "❐";
  return "✧";
});

async function load() {
  release();
  if (!props.hasThumbnail) return;
  try {
    objectUrl.value = await fetchThumbnail(props.projectId);
  } catch {
    // A missing thumbnail is not worth a message on screen; the placeholder says everything the
    // reader needs, and the files below it are still there to download.
    objectUrl.value = null;
  }
}

function release() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
}

onMounted(load);
watch(() => [props.projectId, props.hasThumbnail], load);
onBeforeUnmount(release);
</script>

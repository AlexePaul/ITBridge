<template>
  <div
    class="relative overflow-hidden rounded-lg bg-elevated flex items-center justify-center shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      v-if="objectUrl"
      :src="objectUrl"
      :alt="alt"
      class="w-full h-full object-cover"
      loading="lazy"
    />
    <!--
      No thumbnail is an ordinary outcome, not an error: thumbnailing is allowed to fail, and a
      project without a picture is far better than a project that did not upload. A `.sb3` and a
      video have none at all until E14/S3b, which needs ffmpeg on a host that does not exist yet.
    -->
    <UIcon v-else :name="fallbackIcon" class="text-2xl text-muted" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useProjectsApi } from "~/composables/api/useProjectsApi";

/**
 * One project's thumbnail.
 *
 * A component rather than an `<img>` because the bytes need the bearer token, which a browser will
 * not attach to an image request. They are fetched like any other call and handed over as a blob
 * URL — which this component then owns, and revokes when it goes away. Without the revoke, a
 * gallery scrolled through a term's work would hold every picture it had ever shown.
 */
const props = withDefaults(
  defineProps<{
    projectId: number;
    hasThumbnail: boolean;
    alt?: string;
    size?: number;
    fallbackIcon?: string;
  }>(),
  { alt: "Miniatura lucrării", size: 96, fallbackIcon: "i-lucide-file" }
);

const { fetchThumbnail } = useProjectsApi();
const objectUrl = ref<string | null>(null);

async function load() {
  release();
  if (!props.hasThumbnail) return;
  try {
    objectUrl.value = await fetchThumbnail(props.projectId);
  } catch {
    // A missing thumbnail is not worth a message on screen; the fallback icon says everything the
    // reader needs, and the row is still openable.
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

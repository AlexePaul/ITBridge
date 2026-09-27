<template>
  <div class="cols-3" data-reveal-children>
    <div v-for="project in subject.projects" :key="project.image" class="stack">
      <figure class="plate plate-work">
        <a v-if="project.link" :href="project.link" target="_blank" rel="noopener">
          <NuxtPicture
            format="webp"
            :src="project.image"
            :alt="project.alt"
            sizes="sm:100vw md:50vw lg:360px"
            loading="lazy"
          />
        </a>
        <NuxtPicture
          v-else
          format="webp"
          :src="project.image"
          :alt="project.alt"
          sizes="sm:100vw md:50vw lg:360px"
          loading="lazy"
        />
      </figure>
      <p class="note">
        {{ project.caption }}<span v-if="project.by"> · {{ project.by }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Rendered by the subject pages only when the subject has projects; the
// empty state is no section at all, not a sentence promising one.
import type { Subject } from "#shared/subjects";

defineProps<{ subject: Subject }>();
</script>

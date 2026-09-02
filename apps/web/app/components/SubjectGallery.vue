<template>
  <div v-if="subject.projects.length" class="cols-3" data-reveal-children>
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
  <!--
    Nothing invented in the meantime: a grey box with "coming soon" in it is
    the sign of a page that was published before it was ready. A sentence is
    honest, and it still asks for the phone call.
  -->
  <p v-else class="body-text measure-wide">
    Lucrări făcute de copii la orele de {{ subject.name }} apar aici pe măsură ce le publicăm, cu
    acordul părinților. Până atunci, sună-ne și îți povestim ce au făcut ultimele grupe.
  </p>
</template>

<script setup lang="ts">
import type { Subject } from "#shared/subjects";

defineProps<{ subject: Subject }>();
</script>

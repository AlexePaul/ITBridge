<template>
  <div>
    <div v-for="course in levels" :key="course.slug" data-reveal>
      <div class="course-row">
        <p class="course-num">{{ course.num }}</p>
        <div>
          <h3 class="item-title">{{ course.title }}</h3>
          <p class="label-accent">
            {{ course.level }} · {{ course.minAge }}–{{ course.maxAge }} ani
          </p>
        </div>
        <p class="body-text justified">{{ course.topics }}</p>
        <NuxtLink :to="`/cursuri#${course.slug}`" class="btn btn-secondary">Vezi nivelul</NuxtLink>
      </div>
      <hr class="rule" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { subjectLevels, type Subject } from "#shared/subjects";

/**
 * The course ledger from /cursuri, restricted to the levels whose programme
 * names this subject. Derived, so the page cannot list a level the programme
 * does not; same markup, so the reader recognises the rows from the page it
 * came from.
 */
const props = defineProps<{ subject: Subject }>();
const levels = subjectLevels(props.subject);
</script>

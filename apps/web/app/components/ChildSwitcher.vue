<template>
  <!--
    Nothing to switch between is nothing to draw. A one-child family — most of them — never sees a
    control asking which of their one child they meant.
  -->
  <div v-if="children.length > 1" class="child-switcher" role="group" :aria-label="label">
    <button
      v-if="allowAll"
      type="button"
      class="child-opt"
      :aria-pressed="isShowingAll"
      @click="select(ALL_CHILDREN)"
    >
      Toți
    </button>
    <button
      v-for="child in children"
      :key="child.id"
      type="button"
      class="child-opt"
      :aria-pressed="selected === child.id"
      @click="select(child.id)"
    >
      <span class="child-initial" aria-hidden="true">{{ initialOf(child) }}</span>
      {{ child.firstName }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ALL_CHILDREN, useChildSelection } from "~/composables/useChildSelection";
import type { Child } from "~/types/child.types";

/**
 * Which child a screen is about — E18/S4.
 *
 * Names and initials laid side by side, never a dropdown. A dropdown shows the chosen child and
 * hides that there is another one, which is exactly the failure the story is written against; every
 * child being visible at once is what makes the choice, and the alternative to it, unmissable.
 *
 * The initial is decoration and is hidden from assistive technology: it repeats the first letter of
 * the name printed beside it, so announcing it would read every option twice.
 *
 * The state itself lives in `useChildSelection`, not here, because Absențe and Proiecte both draw
 * this control and a parent moving between them must not have to choose again.
 */
withDefaults(
  defineProps<{
    children: readonly Child[];
    /** Whether "Toți" is offered. Off where a screen can only be about one child at a time. */
    allowAll?: boolean;
    label?: string;
  }>(),
  { allowAll: true, label: "Alege copilul" }
);

const { selected, isShowingAll, select } = useChildSelection();

const initialOf = (child: Child) => child.firstName.trim().charAt(0).toUpperCase();
</script>

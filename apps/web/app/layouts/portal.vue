<template>
  <div class="min-h-screen flex flex-col">
    <a href="#continut" class="skip-link">Sari la conținut</a>
    <PortalNav />
    <main id="continut" tabindex="-1" class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useSeoMeta } from "#imports";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";

/**
 * The parent portal — E18/S4.
 *
 * Split from the `dashboard` layout rather than replacing it. That layout carries the admin area's
 * thirty-two screens, its location filter and its pending-projects badge, and rewriting it here
 * would drag all of that into a story about the parent's five pages. Uniforming the admin area is
 * S5, and it will want a different shell than this one.
 */
const route = useRoute();
const profileStore = useProfileStore();
const profileApi = useProfileApi();

const pageTitle = computed(() => (route.meta as { title?: string }).title || "Portalul familiei");

useHead(() => ({
  title: pageTitle.value,
  titleTemplate: "%s | IT Bridge School",
}));

// Behind a login: nothing in here belongs in a search index.
useSeoMeta({ robots: "noindex, nofollow" });

/**
 * The profile is fetched once, here, rather than by each page.
 *
 * The header prints the family's name on every screen, and Profil is not the only page that needs
 * the record — so a page-level fetch would mean the name appearing a beat late on four screens out
 * of five, or four copies of the same request.
 */
onMounted(async () => {
  if (profileStore.profile) return;
  try {
    await profileApi.fetchProfile();
  } catch {
    // The header then prints no family name, which is the honest thing to show when the record did
    // not load — and no page below it is left waiting on one.
  }
});
</script>

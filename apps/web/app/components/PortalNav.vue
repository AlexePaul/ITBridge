<template>
  <header class="portal-nav">
    <div class="portal-nav-inner" :class="{ 'portal-nav-open': isOpen }">
      <div class="portal-masthead">
        <NuxtLink to="/" class="portal-brand" @click="isOpen = false">
          {{ SCHOOL_NAME }}
        </NuxtLink>

        <button
          type="button"
          class="btn btn-secondary btn-icon portal-nav-toggle"
          :aria-expanded="isOpen"
          aria-controls="portal-site-menu"
          :aria-label="isOpen ? 'Închide meniul' : 'Deschide meniul'"
          @click="isOpen = !isOpen"
        >
          <UIcon :name="isOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="size-4" />
        </button>

        <div id="portal-site-menu" class="portal-nav-links">
          <NuxtLink
            v-for="link in siteLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link"
            @click="isOpen = false"
          >
            {{ link.label }}
          </NuxtLink>
          <button type="button" class="btn btn-ghost" @click="handleLogout">Ieși din cont</button>
        </div>
      </div>

      <nav class="portal-tabs" aria-label="Portalul familiei">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="{ path: tab.to, query: linkQuery }"
          class="portal-tab"
          :aria-current="isCurrent(tab.to) ? 'page' : undefined"
        >
          {{ tab.label }}
        </NuxtLink>
        <span v-if="familyName" class="portal-family">{{ familyName }}</span>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "#imports";
import { useChildSelection } from "~/composables/useChildSelection";
import { useLogout } from "~/composables/useLogout";
import { useProfileStore } from "~/stores/profileStore";
import { SCHOOL_NAME } from "#shared/school";

/**
 * The portal's chrome — E18/S4.
 *
 * A masthead over a row of tabs, rather than the collapsible sidebar the admin area uses. The two
 * audiences are not alike: an admin works in this app all day and has thirty screens to reach, a
 * parent opens it on a phone a few times a month and has five. A sidebar spends a third of a 390px
 * screen on a control for choosing between five things.
 *
 * On a phone the masthead's links fold into the button, exactly as the public header does — the
 * portal has to feel like the same site — but **the tabs do not fold**. They are the navigation,
 * and burying five links behind a hamburger on the screen a parent uses most would put every page
 * two taps away. The row scrolls sideways instead.
 */
const route = useRoute();
const { handleLogout } = useLogout();
const profileStore = useProfileStore();
const { linkQuery } = useChildSelection();

const isOpen = ref(false);

const siteLinks = [
  { label: "Cursuri", to: "/cursuri" },
  { label: "Locații", to: "/locatii" },
  { label: "Contact", to: "/contact" },
];

// Prezența sits next to Absențe: one is what happened, the other what is coming and what it earned.
const tabs = [
  { label: "Acasă", to: "/user/dashboard" },
  { label: "Prezența", to: "/user/prezenta" },
  { label: "Absențe și recuperări", to: "/user/absente" },
  { label: "Proiecte", to: "/user/proiecte" },
  { label: "Plăți", to: "/user/payments" },
  { label: "Profil", to: "/user/profile" },
];

/**
 * Matched on the path alone.
 *
 * `NuxtLink`'s own `aria-current` compares the whole location, so carrying the selected child in the
 * query string would leave every tab looking inactive the moment a parent chose a child.
 */
const isCurrent = (to: string) => route.path === to;

const familyName = computed(() => {
  const profile = profileStore.profile;
  return profile?.lastName ? `Familia ${profile.lastName}` : "";
});
</script>

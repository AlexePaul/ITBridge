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

      <nav
        ref="tabStrip"
        class="portal-tabs"
        :class="{
          'portal-tabs-more-before': edges.before,
          'portal-tabs-more-after': edges.after,
        }"
        aria-label="Portalul familiei"
        @scroll.passive="measureTabs"
        @focusin="onTabFocus"
      >
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "#imports";
import { scrollEdges, scrollLeftToReveal } from "~/composables/useScrollEdges";
import { useChildSelection } from "~/composables/useChildSelection";
import { useLogout } from "~/composables/useLogout";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";
import { AWAITING_FAMILY_PAGES } from "~/middleware/02.profile-setup.global";
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
 *
 * **And it has to say so** (QA of 27 September 2026). At 390 px „Plăți" and „Profil" sat past the
 * right edge with nothing to show they were there, and on `/user/payments` the tab marked as the
 * current page was itself off screen. The current tab is now scrolled into view when the portal
 * opens and at every change of page, and the row fades on each side that still hides a tab.
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
const allTabs = [
  { label: "Acasă", to: "/user/dashboard" },
  { label: "Prezența", to: "/user/prezenta" },
  { label: "Absențe și recuperări", to: "/user/absente" },
  { label: "Proiecte", to: "/user/proiecte" },
  { label: "Plăți", to: "/user/payments" },
  { label: "Profil", to: "/user/profile" },
];

// An account waiting to be attached to its family can open only its home page (review of 26
// September 2026); tabs it would be sent back from are not offered.
const userStore = useUserStore();
const tabs = computed(() =>
  userStore.user?.awaitingFamily
    ? allTabs.filter((tab) => AWAITING_FAMILY_PAGES.includes(tab.to))
    : allTabs
);

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

const tabStrip = ref<HTMLElement | null>(null);
/** Which sides of the row hide a tab — the fade in `classical.css` reads these two classes. */
const edges = ref({ before: false, after: false });

const measureTabs = () => {
  const strip = tabStrip.value;
  if (!strip) return;
  edges.value = scrollEdges(strip.scrollLeft, strip.scrollWidth, strip.clientWidth);
};

/**
 * A tab, brought into the row's view — the row alone, and only as far as needed. Not
 * `scrollIntoView`, which also moved the page: see `scrollLeftToReveal`. The margin is the row's own
 * `scroll-padding-inline`, the fade's width, so the number lives in the stylesheet only.
 */
const revealTab = (tab: HTMLElement) => {
  const strip = tabStrip.value;
  if (!strip) return;
  const row = strip.getBoundingClientRect();
  const box = tab.getBoundingClientRect();
  const start = box.left - row.left + strip.scrollLeft;
  const margin = parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0;
  strip.scrollLeft = scrollLeftToReveal(strip, { start, end: start + box.width }, margin);
  measureTabs();
};

const revealCurrentTab = async () => {
  await nextTick();
  const current = tabStrip.value?.querySelector<HTMLElement>('[aria-current="page"]');
  if (current) revealTab(current);
  else measureTabs();
};

/** The keyboard's own scrolling stops at the row's edge, under the fade; this finishes the job. */
const onTabFocus = (event: FocusEvent) => {
  const tab = (event.target as HTMLElement | null)?.closest<HTMLElement>(".portal-tab");
  if (tab) revealTab(tab);
};

onMounted(() => {
  void revealCurrentTab();
  window.addEventListener("resize", measureTabs, { passive: true });
});

onBeforeUnmount(() => window.removeEventListener("resize", measureTabs));

// A new page, or a different set of tabs once the account's state is known.
watch([() => route.path, () => tabs.value.length], () => void revealCurrentTab());
</script>

<template>
  <header class="nav" :class="{ 'is-stuck': isStuck }">
    <div class="page nav-inner" :class="{ 'nav-open': isOpen }">
      <NuxtLink to="/" class="nav-brand" @click="isOpen = false">IT Bridge School</NuxtLink>

      <button
        type="button"
        class="btn btn-secondary btn-icon nav-toggle"
        :aria-expanded="isOpen"
        aria-controls="nav-menu"
        :aria-label="isOpen ? 'Închide meniul' : 'Deschide meniul'"
        @click="isOpen = !isOpen"
      >
        <UIcon :name="isOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="size-4" />
      </button>

      <nav id="nav-menu" class="nav-links" aria-label="Navigare principală">
        <NuxtLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          @click="isOpen = false"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="nav-actions">
        <template v-if="!signedIn">
          <!--
            E20/S2. The main call to action now leads to the booking form rather than to the contact
            page: the whole point of the epic is that a parent can pick an hour at 20:00 without
            ringing anybody, and „Înscrie-ți copilul" also promised something the school does not do
            from a form — enrolment is an admin's job, a trial is not.
          -->
          <NuxtLink to="/proba" class="btn btn-primary" @click="isOpen = false">
            Programează o probă
          </NuxtLink>
          <NuxtLink to="/auth/login" class="btn btn-ghost" @click="isOpen = false">Cont</NuxtLink>
        </template>
        <template v-else>
          <NuxtLink :to="dashboardRoute" class="btn btn-primary" @click="isOpen = false">
            Contul meu
          </NuxtLink>
          <button type="button" class="btn btn-ghost" @click="handleLogout">Ieși din cont</button>
        </template>
      </div>
    </div>

    <!-- Decoration, and duplicated by the scrollbar the browser already draws,
         so it stays out of the accessibility tree. -->
    <div class="nav-progress" aria-hidden="true" :style="{ '--progress': progress }"></div>
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";

const userStore = useUserStore();
const { handleLogout } = useLogout();

const isOpen = ref(false);

/**
 * Who is signed in, but only once the bar has mounted.
 *
 * The public pages are rendered on the server, where nobody is signed in — authentication is
 * client-only (`plugins/01.auth.client.ts`) — so the HTML always carries the visitor's buttons. The
 * plugin has already set the user by the time the browser hydrates, so reading the store directly
 * made the first client render the signed-in branch, and hydration reconciles a mismatch by
 * replacing text and keeping attributes. The result was „Contul meu" pointing at `/proba`: a left
 * click still worked, through the router, while ctrl-click, "open in new tab" and "copy link" went
 * to the trial form. That is the trap CLAUDE.md describes for the admin shell, on the one public
 * component that depends on who is signed in.
 *
 * Holding the visitor's branch until mount makes hydration match the server's HTML exactly; the
 * switch after it is an ordinary patch, which updates `href` along with the text.
 */
const mounted = ref(false);
const signedIn = computed(() => mounted.value && Boolean(userStore.user));

// The bar is sticky: it takes an edge once the page has moved under it, and
// carries how far down that page the reader is. Both are read on one rAF per
// scroll burst rather than on every event, and neither exists on the server —
// the header renders flat and gains the state on mount.
const isStuck = ref(false);
const progress = ref(0);
let frame = 0;

const measure = () => {
  frame = 0;
  const top = window.scrollY;
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  isStuck.value = top > 8;
  progress.value = scrollable > 0 ? Math.min(top / scrollable, 1) : 0;
};

const onScroll = () => {
  if (!frame) frame = requestAnimationFrame(measure);
};

onMounted(() => {
  mounted.value = true;
  measure();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onScroll);
  cancelAnimationFrame(frame);
});

const navigationItems = [
  { label: "Acasă", to: "/" },
  { label: "Cursuri", to: "/cursuri" },
  { label: "Locații", to: "/locatii" },
  { label: "Despre noi", to: "/despre-noi" },
  { label: "Lecție de probă", to: "/proba" },
  { label: "Contact", to: "/contact" },
];

const dashboardRoute = computed(() =>
  userStore.user?.role === "ADMIN" ? "/admin/dashboard" : "/user/profile"
);
</script>

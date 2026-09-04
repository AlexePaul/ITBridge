<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible class="border-r">
      <template #header>
        <NuxtLink to="/" class="font-bold text-lg text-highlighted">IT Bridge School</NuxtLink>
      </template>
      <UNavigationMenu :items="navigationItems" orientation="vertical" class="mt-3" />
    </UDashboardSidebar>
    <UDashboardPanel>
      <template #header>
        <!-- On a phone this button is the only route to every other screen, so it gets a thumb's
             worth of surface (44px) rather than the 32px default. -->
        <UDashboardNavbar :title="pageTitle" class="border-b" :ui="{ toggle: 'size-11' }">
          <!-- E18/S7. `min-w-0` is the whole fix, and it is not cosmetic: without it this group
               keeps its content's intrinsic width, and on a 390px phone it grew back over the
               menu button in the leading slot — leaving a 10px strip of it tappable, so a tap on
               the hamburger opened the location filter instead. The menu is the only way to
               anywhere on a phone. The username goes with it under `sm`: on a phone it is the
               least useful thing in the bar and the most expensive. -->
          <template #right>
            <div class="flex min-w-0 items-center gap-2 sm:gap-3">
              <LocationSwitcher v-if="isAdmin" class="min-w-0 shrink" />
              <span v-if="user" class="hidden truncate sm:inline">{{ user.username }}</span>
              <UButton
                label="Ieșire"
                size="md"
                color="primary"
                variant="outline"
                class="min-h-11 shrink-0"
                @click="handleLogout"
              />
            </div>
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <!-- E11/S2: why the portal below is empty, when it is. -->
        <AccountStatusNotice />

        <!-- Overdue Invoice Alert -->
        <UCard
          v-if="overdueInvoices && !isAdmin"
          class="w-9/12 mx-auto border border-error rounded-none mt-12 z-15 min-h-24"
          variant="subtle"
        >
          <div
            class="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 py-2"
          >
            <div class="flex items-center gap-2 sm:flex-1">
              <UIcon
                name="i-lucide-alert-circle"
                class="text-error shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
              />
              <p class="font-bold text-lg">
                Au fost detectate facturi restante, daca aceasta este o greseala, nu ezitati sa ne
                contactati.
              </p>
            </div>
            <NuxtLink
              to="/user/payments"
              class="underline text-sm text-error font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
            >
              Acceseaza istoricul plăților
            </NuxtLink>
          </div>
        </UCard>

        <!-- Pending Invoice Alert -->
        <UCard
          v-else-if="pendingInvoices && !isAdmin"
          class="w-9/12 md:1/3 mx-auto border border-warning rounded-none mt-12 z-15 min-h-24"
          variant="subtle"
        >
          <div
            class="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 py-2"
          >
            <div class="flex items-center gap-2 sm:flex-1">
              <UIcon
                name="i-lucide-alert-circle"
                class="text-warning shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
              />
              <p class="font-bold text-lg">
                Aveti facturi care necesita plata. Va rugam sa accesati istoricul plăților pentru
                detalii.
                <br />Daca aceasta este o greseala, nu ezitati sa ne contactati.
              </p>
            </div>
            <NuxtLink
              to="/user/payments"
              class="underline text-sm text-warning font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
            >
              Acceseaza istoricul plăților
            </NuxtLink>
          </div>
        </UCard>

        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useRoomsApi } from "~/composables/api/useRoomsApi";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { usePendingProjectsStore } from "~/stores/pendingProjectsStore";
import { overdueInvoices, pendingInvoices } from "~/composables/api/useInvoiceApi";
import { computed } from "vue";
import { useRoute, useSeoMeta } from "#imports";

const { user } = useUserStore();
const { handleLogout } = useLogout();

const userStore = useUserStore();
const isAdmin = userStore.user?.role === "ADMIN";
const route = useRoute();

const pageTitle = computed(() => {
  const title = (route.meta as any)?.title;
  return title || "Acasă";
});

useHead(() => ({
  title: pageTitle.value,
  titleTemplate: "%s | IT Bridge School",
}));

// The portal is behind a login; nothing in it belongs in a search index.
useSeoMeta({ robots: "noindex, nofollow" });

const pendingProjects = usePendingProjectsStore();

// Loaded once, here, rather than in each admin page: the switcher lives in this layout and every
// page below it filters on the selection, so the list has to exist before the first page renders.
if (isAdmin) {
  const locationsApi = useLocationsApi();
  const roomsApi = useRoomsApi();
  const projectsApi = useProjectsApi();
  onMounted(async () => {
    try {
      await Promise.all([locationsApi.fetchLocations(), roomsApi.fetchRooms()]);
    } catch {
      // The switcher then offers only "Toate locațiile", which is the honest thing to show when
      // the list could not be loaded — and no page below is left waiting on it.
    }
    try {
      // E17/S8. Loaded here rather than on the projects screen, because the point of the figure is
      // that it is visible from the menu on every admin screen: the risk of a button is that nobody
      // presses it, and a count you have to navigate to does not mitigate that.
      pendingProjects.set(await projectsApi.fetchPendingProjects());
    } catch {
      // No badge, then. An absent badge reads as "nothing waiting", which is a wrong answer — but
      // a layout that refuses to render over it would be a worse one, and the projects screen still
      // shows the backlog to anybody who opens it.
    }
  });
}

const navigationItems = computed(() => {
  const baseItems = [
    { label: "Acasă", to: "/", icon: "i-lucide-home" },
    { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  ];

  const userPages = [
    { label: "Profil", to: "/user/profile", icon: "i-lucide-user" },
    { label: "Situatia Scolara", to: "/user/dashboard", icon: "i-lucide-chart-bar" },
    { label: "Absențe și recuperări", to: "/user/absente", icon: "i-lucide-calendar-off" },
    { label: "Istoric Plati", to: "/user/payments", icon: "i-lucide-credit-card" },
    { label: "Proiectele copiilor", to: "/user/proiecte", icon: "i-lucide-sparkles" },
  ];

  const adminPages = [
    {
      label: "Tablou de Bord Administrator",
      to: "/admin/dashboard",
      icon: "i-lucide-layout-dashboard",
    },
    { label: "Rapoarte", to: "/admin/rapoarte", icon: "i-lucide-chart-bar" },
    { label: "Conturi în așteptare", to: "/admin/approvals", icon: "i-lucide-user-check" },
    { label: "Profiluri Utilizatori", to: "/admin/profiles", icon: "i-lucide-users" },
    // E20/S3. First in the admin list, above the children who are already here: a family who came
    // to a trial and was never rung back is the most expensive thing the school can lose, and the
    // whole point of the screen is that somebody sees it without navigating to it.
    { label: "Cereri și probe", to: "/admin/leads", icon: "i-lucide-inbox" },
    { label: "Copii", to: "/admin/children", icon: "i-lucide-baby" },
    { label: "Grupe", to: "/admin/groups", icon: "i-lucide-users-round" },
    { label: "Formarea grupelor", to: "/admin/formare", icon: "i-lucide-user-plus" },
    { label: "Locații și săli", to: "/admin/locations", icon: "i-lucide-map-pin" },
    { label: "Prezență", to: "/admin/attendance", icon: "i-lucide-check-square" },
    { label: "Prezența de azi", to: "/admin/attendance/azi", icon: "i-lucide-smartphone" },
    { label: "Orarul", to: "/admin/orar", icon: "i-lucide-calendar-clock" },
    { label: "Calendar școlar", to: "/admin/calendar", icon: "i-lucide-calendar-x" },
    {
      label: "Proiecte",
      to: "/admin/proiecte",
      icon: "i-lucide-sparkles",
      // Only when there is something to say. A badge reading "0" is furniture; one that appears
      // only when documents are waiting is a signal, and it turns red once the oldest of them has
      // waited past the line the API publishes.
      ...(pendingProjects.total > 0
        ? {
            badge: {
              label: String(pendingProjects.total),
              color: pendingProjects.stale ? ("warning" as const) : ("neutral" as const),
              variant: "subtle" as const,
            },
          }
        : {}),
    },
    { label: "Facturi", to: "/admin/invoices", icon: "i-lucide-notebook-pen" },
    { label: "Emitere facturi", to: "/admin/invoices/emitere", icon: "i-lucide-file-plus" },
    { label: "Plăți", to: "/admin/payments", icon: "i-lucide-wallet" },
    { label: "Restanțe", to: "/admin/restante", icon: "i-lucide-alert-circle" },
    { label: "Reduceri", to: "/admin/reduceri", icon: "i-lucide-percent" },
    { label: "Șabloane de email", to: "/admin/emailuri", icon: "i-lucide-mail" },
    { label: "Anunțuri", to: "/admin/anunturi", icon: "i-lucide-megaphone" },
    { label: "Livrări", to: "/admin/livrari", icon: "i-lucide-send" },
  ];

  if (isAdmin) {
    return [...baseItems, ...adminPages];
  }

  return [...baseItems, ...userPages];
});
</script>

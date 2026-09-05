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

/**
 * The menu, in groups — E18/S5.
 *
 * It was twenty-five flat entries in the order the epics happened to deliver them, so finding
 * anything meant reading the whole list: "Restanțe" sat between "Plăți" and "Reduceri" only because
 * E16 came after E15. Grouped, the same twenty-five are six short lists a reader scans by heading,
 * and the heading is usually enough — somebody looking for money stops at "Bani" without reading
 * the other nineteen labels.
 *
 * The order inside a group is the order of the working day, not the alphabet: today's register
 * before the timetable it came from, issuing before chasing. `UNavigationMenu` renders an array of
 * arrays as separated groups and `type: "label"` as the heading.
 *
 * The two public links move to the bottom. They were first, which meant the two entries an admin
 * never needs were the two they read first, every time.
 */
const navigationItems = computed(() => {
  const siteGroup = [
    { type: "label" as const, label: "Site" },
    { label: "Acasă", to: "/", icon: "i-lucide-home" },
    { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  ];

  if (!isAdmin) {
    return [
      [
        { type: "label" as const, label: "Copiii mei" },
        { label: "Situația școlară", to: "/user/dashboard", icon: "i-lucide-chart-bar" },
        { label: "Absențe și recuperări", to: "/user/absente", icon: "i-lucide-calendar-off" },
        { label: "Proiectele copiilor", to: "/user/proiecte", icon: "i-lucide-sparkles" },
      ],
      [
        { type: "label" as const, label: "Contul meu" },
        { label: "Istoric plăți", to: "/user/payments", icon: "i-lucide-credit-card" },
        { label: "Profil", to: "/user/profile", icon: "i-lucide-user" },
      ],
      siteGroup,
    ];
  }

  return [
    [
      { label: "Tablou de bord", to: "/admin/dashboard", icon: "i-lucide-layout-dashboard" },
      { label: "Rapoarte", to: "/admin/rapoarte", icon: "i-lucide-chart-bar" },
    ],
    [
      { type: "label" as const, label: "Zi de zi" },
      { label: "Prezența de azi", to: "/admin/attendance/azi", icon: "i-lucide-smartphone" },
      { label: "Orarul", to: "/admin/orar", icon: "i-lucide-calendar-clock" },
      { label: "Prezență", to: "/admin/attendance", icon: "i-lucide-check-square" },
      { label: "Calendar școlar", to: "/admin/calendar", icon: "i-lucide-calendar-x" },
    ],
    [
      { type: "label" as const, label: "Familii" },
      // E20/S3, first in its group: a family who came to a trial and was never rung back is the
      // most expensive thing the school can lose, and the point of the screen is that somebody
      // sees it without navigating to it.
      { label: "Cereri și probe", to: "/admin/leads", icon: "i-lucide-inbox" },
      { label: "Conturi în așteptare", to: "/admin/approvals", icon: "i-lucide-user-check" },
      { label: "Profiluri", to: "/admin/profiles", icon: "i-lucide-users" },
      { label: "Copii", to: "/admin/children", icon: "i-lucide-baby" },
    ],
    [
      { type: "label" as const, label: "Grupe și săli" },
      { label: "Grupe", to: "/admin/groups", icon: "i-lucide-users-round" },
      { label: "Formarea grupelor", to: "/admin/formare", icon: "i-lucide-user-plus" },
      { label: "Locații și săli", to: "/admin/locations", icon: "i-lucide-map-pin" },
    ],
    [
      { type: "label" as const, label: "Bani" },
      { label: "Emitere facturi", to: "/admin/invoices/emitere", icon: "i-lucide-file-plus" },
      { label: "Facturi", to: "/admin/invoices", icon: "i-lucide-notebook-pen" },
      { label: "Plăți", to: "/admin/payments", icon: "i-lucide-wallet" },
      { label: "Restanțe", to: "/admin/restante", icon: "i-lucide-alert-circle" },
      { label: "Reduceri", to: "/admin/reduceri", icon: "i-lucide-percent" },
    ],
    [
      { type: "label" as const, label: "Comunicare" },
      {
        label: "Proiecte",
        to: "/admin/proiecte",
        icon: "i-lucide-sparkles",
        // Only when there is something to say. A badge reading "0" is furniture; one that appears
        // only when documents are waiting is a signal, and it turns warning-coloured once the
        // oldest of them has waited past the line the API publishes.
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
      { label: "Anunțuri", to: "/admin/anunturi", icon: "i-lucide-megaphone" },
      { label: "Livrări", to: "/admin/livrari", icon: "i-lucide-send" },
      { label: "Șabloane de email", to: "/admin/emailuri", icon: "i-lucide-mail" },
    ],
    siteGroup,
  ];
});
</script>

<template>
  <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
    <h1 class="text-4xl font-bold text-center mt-12 mb-8">Profil</h1>

    <!-- Profile Content -->
    <div v-if="profile" class="space-y-6">
      <!-- Personal Information Card -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-user" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Informații Personale</h2>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-4">
            <div>
              <label class="text-sm font-medium text-muted">Nume Complet</label>
              <p class="text-lg mt-1">{{ profile.firstName }} {{ profile.lastName }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-muted">Email</label>
              <div class="flex items-center gap-2 mt-1">
                <UIcon name="i-lucide-mail" class="text-primary" />
                <p class="text-lg">{{ profile.email }}</p>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label class="text-sm font-medium text-muted">Telefon</label>
              <div class="flex items-center gap-2 mt-1">
                <UIcon name="i-lucide-phone" class="text-primary" />
                <p class="text-lg">{{ profile.phone }}</p>
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-muted">Adresă</label>
              <div class="flex items-center gap-2 mt-1">
                <UIcon name="i-lucide-map-pin" class="text-primary" />
                <p class="text-lg">{{ profile.address }}</p>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Children Information Card -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-users" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Copii Înregistrați</h2>
          </div>
        </template>

        <div v-if="profile.children && profile.children.length > 0" class="space-y-4">
          <div
            v-for="child in profile.children"
            :key="child.id"
            class="border rounded-lg p-4 hover:border-primary transition-colors"
          >
            <div class="flex items-start justify-between">
              <div class="space-y-3 flex-1">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-baby" class="text-primary text-xl" />
                  <h3 class="text-xl font-semibold">{{ child.firstName }} {{ child.lastName }}</h3>
                  <UBadge
                    color="primary"
                    variant="subtle"
                    size="lg"
                    class="h-6 flex items-center px-3 justify-center p-2 w-min ml-auto"
                  >
                    #{{ child.id }}
                  </UBadge>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-calendar" class="text-muted" />
                    <span class="text-muted">Data nașterii:</span>
                    <span class="font-medium">{{
                      new Date(child.birthDate).toLocaleDateString("ro-RO", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    }}</span>
                  </div>

                  <div v-if="child.group" class="flex items-center gap-2">
                    <UIcon name="i-lucide-clock" class="text-muted" />
                    <span class="text-muted">Program:</span>
                    <span class="font-medium"
                      >{{ child.group.name }} · {{ getWeekdayName(child.group.weekday) }},
                      {{ formatTime(child.group.startTime) }} -
                      {{ formatTime(child.group.endTime) }}</span
                    >
                  </div>
                  <!-- A parent may have one child at each address, so the group's location is not
                       something the page header could say once for all of them. -->
                  <div v-if="child.group?.room" class="flex items-center gap-2">
                    <UIcon name="i-lucide-map-pin" class="text-muted" />
                    <span class="text-muted">Locație:</span>
                    <span class="font-medium"
                      >{{ child.group.room.location.name }} · {{ child.group.room.name }}</span
                    >
                  </div>
                  <div v-else class="flex items-center gap-2">
                    <UIcon name="i-lucide-alert-circle" class="text-warning" />
                    <span class="text-warning font-medium">Niciun grup atribuit</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 text-xs text-muted">
                  <UIcon name="i-lucide-info" class="text-xs" />
                  <span>Înregistrat la: {{ formatDate(child.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
          <UButton
            class="mt-4"
            variant="subtle"
            color="primary"
            :to="`/admin/profiles/${profile.id}/children/new`"
          >
            Adaugă Copil
          </UButton>
        </div>

        <div v-else class="text-center py-8">
          <UIcon name="i-lucide-user-x" class="text-4xl text-muted mx-auto mb-3" />
          <p class="text-muted">Nu aveți copii înregistrați în sistem.</p>
        </div>
      </UCard>

      <!-- Account Information Card -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-settings" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Informații Cont</h2>
          </div>
        </template>

        <div class="space-y-3">
          <div class="flex items-center justify-between py-2 border-b">
            <span class="text-muted">ID Profil</span>
            <span class="font-mono text-sm">{{ profile.id }}</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span class="text-muted">Număr de copii</span>
            <UBadge color="primary" variant="subtle">
              {{ profile.children?.length || 0 }}
            </UBadge>
          </div>
        </div>
      </UCard>
      <!--
        The referral reward — E20/S5, a bump in each direction.

        Here rather than on /admin/reduceri because here the family is already named: from the
        discounts screen the same control needs a picker first, which is the field the form already
        asks for. Each press up is one more month at half price, never a deeper cut on one month.
      -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-badge-percent" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Recomandare</h2>
          </div>
        </template>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="max-w-xl space-y-1">
            <p class="text-muted">
              Scade <strong>50%</strong> din factură, o lună de fiecare apăsare. Apare în lista de
              reduceri și se scade automat la emitere.
            </p>
            <p v-if="referralMonths.length" class="font-medium">
              {{ referralSummary }}
            </p>
            <p v-else class="text-muted">Nicio lună acordată.</p>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="subtle"
              class="min-h-11"
              icon="i-lucide-minus"
              aria-label="Scoate ultima lună"
              :loading="referralBusy === 'down'"
              :disabled="Boolean(referralBusy) || referralMonths.length === 0"
              @click="bumpReferral(-1)"
            />
            <span class="min-w-14 text-center text-lg font-semibold tabular-nums">
              {{ referralMonths.length }}
              {{ referralMonths.length === 1 ? "lună" : "luni" }}
            </span>
            <UButton
              color="primary"
              variant="solid"
              class="min-h-11"
              icon="i-lucide-plus"
              aria-label="Mai adaugă o lună"
              :loading="referralBusy === 'up'"
              :disabled="Boolean(referralBusy)"
              @click="bumpReferral(1)"
            />
          </div>
        </div>
      </UCard>

      <UButton
        class="mt-4 mx-auto block justify-center text-center"
        variant="outline"
        color="error"
        :to="`/admin/profiles/${profile?.id}/confirmation`"
      >
        Sterge Profil
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useDiscountsApi } from "~/composables/api/useDiscountsApi";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { formatMonth } from "~/composables/useAdminFormat";
import type { Profile } from "~/types/profile.types";
import { formatTime, getWeekdayName } from "~/composables/useUtils";

const route = useRoute();
const profileApi = useProfileApi();
const discountsApi = useDiscountsApi();
const { success, error } = useNotifications();
const profile: Ref<Profile | null> = ref(null);

/**
 * The referral reward — E20/S5, a bump in each direction.
 *
 * The month list is always the server's answer, never this page adding one to what it had: the two
 * would disagree the moment somebody removed a month from `/admin/reduceri` in another tab, and the
 * disagreement would show up as a `−` press taking back a month that was already gone.
 */
const referralMonths = ref<string[]>([]);
const referralBusy = ref<"up" | "down" | null>(null);

const referralSummary = computed(() =>
  referralMonths.value.length === 0
    ? ""
    : `50% pe ${referralMonths.value.map((month) => formatMonth(month)).join(", ")}`
);

const bumpReferral = async (direction: 1 | -1) => {
  if (!profile.value || referralBusy.value) return;
  referralBusy.value = direction === 1 ? "up" : "down";
  const before = referralMonths.value.length;
  try {
    const reward =
      direction === 1
        ? await discountsApi.grantReferralMonth(profile.value.id)
        : await discountsApi.revokeReferralMonth(profile.value.id);
    referralMonths.value = reward.months;
    const changed = reward.months[direction === 1 ? reward.months.length - 1 : before - 1];
    success(
      direction === 1
        ? `Reducere de 50% adăugată pe ${formatMonth(changed ?? "")}.`
        : "Ultima lună de recomandare a fost scoasă."
    );
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut schimba reducerea."));
  } finally {
    referralBusy.value = null;
  }
};

onMounted(async () => {
  profile.value = (await profileApi.fetchProfile(route.params.profileId as string))[0] || null;
  if (!profile.value) return;
  try {
    referralMonths.value = (await discountsApi.fetchReferralReward(profile.value.id)).months;
  } catch {
    // The reward is a detail on a page about a family; failing to read it leaves the control at
    // zero rather than replacing the profile with an error.
    referralMonths.value = [];
  }
});
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Profile Details",
});

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

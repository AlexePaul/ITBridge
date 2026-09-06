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
        The referral reward, in one press — E20/S5.

        Here rather than on /admin/reduceri because here the family is already named: from the
        discounts screen the same action needs a picker first, which is the field the form already
        asks for. The month is the server's to work out.
      -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-percent" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Recomandare</h2>
          </div>
        </template>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-muted max-w-xl">
            Scade <strong>50%</strong> din factura de luna viitoare, pentru o familie adusă de
            aceasta. Apare în lista de reduceri și se scade automat la emitere. O poți șterge de
            acolo dacă te-ai răzgândit.
          </p>
          <UButton
            color="primary"
            variant="solid"
            class="min-h-11"
            icon="i-lucide-badge-percent"
            :loading="grantingReferral"
            :disabled="grantingReferral"
            @click="grantReferral"
          >
            −50% luna viitoare
          </UButton>
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
const grantingReferral = ref(false);

/**
 * One press, no fields — E20/S5.
 *
 * The month comes back from the server rather than being computed here, so the confirmation names
 * the month that was actually written. A refusal is the interesting case: the family already has a
 * percentage on that month, and two of them make it free. `apiErrorMessage` has the sentence.
 */
const grantReferral = async () => {
  if (!profile.value || grantingReferral.value) return;
  grantingReferral.value = true;
  try {
    const discount = await discountsApi.grantReferralDiscount(profile.value.id);
    success(`Reducere de 50% adăugată pe ${formatMonth(discount.monthIssued)}.`);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut adăuga reducerea."));
  } finally {
    grantingReferral.value = false;
  }
};

onMounted(async () => {
  profile.value = (await profileApi.fetchProfile(route.params.profileId as string))[0] || null;
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

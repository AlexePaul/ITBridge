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

      <!-- E17/S4. The only preference there is, and the copy has to say what it does *not* touch:
           a parent who reads "unsubscribe" next to a school's name reasonably fears losing the
           invoice and their child's work. -->
      <UCard class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-bell" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Comunicări</h2>
          </div>
        </template>

        <div class="flex items-start justify-between gap-6">
          <div class="min-w-0">
            <p class="font-medium">Noutăți de la școală</p>
            <p class="text-muted text-sm mt-1">
              Tabere, ateliere, evenimente. Poți opri oricând, iar dacă nu le pornești nu primești
              nimic de genul ăsta.
            </p>
            <p class="text-muted text-sm mt-2">
              <strong>Nu se opresc de aici</strong> facturile, confirmările de plată, anunțurile
              despre orele copilului tău și proiectele lui. Alea sunt lucrurile pentru care ne-ai
              dat datele, nu reclamă.
            </p>
          </div>
          <USwitch
            :model-value="profile.marketingOptIn"
            :loading="savingPreference"
            class="shrink-0 mt-1"
            @update:model-value="setMarketing"
          />
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
                      >{{ getWeekdayName(child.group.weekday) }},
                      {{ formatTime(child.group.startTime) }} -
                      {{ formatTime(child.group.endTime) }}</span
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
    </div>

    <!-- No Profile State -->
    <div v-else class="text-center py-12">
      <UIcon name="i-lucide-alert-triangle" class="text-4xl text-error mx-auto mb-3" />
      <p class="text-error text-lg">Nu s-au putut încărca informațiile profilului.</p>
      <UButton @click="loadProfile" class="mt-4" color="primary">Reîncarcă</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";

const profileApi = useProfileApi();
const { success, error } = useNotifications();
const profileStore = useProfileStore();

const profile = computed(() => profileStore.profile);

definePageMeta({
  title: "Profil",
  layout: "dashboard" as any,
});

const loadProfile = async () => {
  try {
    await profileApi.fetchProfile();
  } catch (err) {
    console.error("Error loading profile:", err);
  }
};

onMounted(async () => {
  await loadProfile();
});

/**
 * The one preference a parent has — E17/S4.
 *
 * Saved on the flip rather than behind a Save button: it is a single boolean, and a switch that
 * needs confirming reads as though something dangerous is being decided. Nothing transactional is
 * affected, whatever it is set to.
 */
const savingPreference = ref(false);
const setMarketing = async (value: boolean) => {
  if (!profile.value) return;
  savingPreference.value = true;
  try {
    await profileApi.updateProfile({ marketingOptIn: value }, profile.value.id);
    success(value ? "Îți trimitem și noutățile." : "Nu-ți mai trimitem noutăți.");
    await loadProfile();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut salva preferința"));
  } finally {
    savingPreference.value = false;
  }
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

<template>
  <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
    <h1 class="text-4xl font-bold text-center mt-12 mb-8">Profil</h1>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center items-center min-h-100">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-4xl text-primary" />
    </div>

    <!-- Profile Content -->
    <div v-else-if="profile" class="space-y-6">
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
                      >{{ getWeekdayName(child.group.weekday) }}, {{ child.group.startTime }} -
                      {{ child.group.endTime }}</span
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

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <UIcon name="i-lucide-alert-triangle" class="text-4xl text-error mx-auto mb-3" />
      <p class="text-error text-lg">{{ error }}</p>
      <UButton @click="loadProfile" class="mt-4" color="primary">Reîncarcă</UButton>
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

const profileApi = useProfileApi();
const profileStore = useProfileStore();

const profile = computed(() => profileStore.profile);
const loading = computed(() => profileStore.loading);
const error = computed(() => profileStore.error);

definePageMeta({
  title: "Profil",
  layout: "dashboard" as any,
  middleware: "auth" as any,
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

function getWeekdayName(weekday: number): string {
  const days = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
  return days[weekday - 1] || "Necunoscut";
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

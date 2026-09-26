<template>
  <AdminPage title="Profil" back-to="/admin/profiles">
    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <AdminEmpty
      v-else-if="!profile"
      title="Familia asta nu există."
      description="Poate a fost ștearsă, sau adresa e greșită."
      icon="i-lucide-user-x"
    />

    <div v-else class="space-y-6">
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

        <!-- E11 S2, review of 26 September 2026: a family the office typed in has no account and no
             way to make one on its own — the register form refused its address. The link goes to
             the address on file and the family creates the account there. -->
        <div
          v-if="!profile.hasUser && !profile.erasedAt"
          class="mt-6 border-t border-default pt-4 flex flex-wrap items-center gap-3"
        >
          <UBadge color="neutral" variant="subtle">Fără cont</UBadge>
          <p class="text-sm text-muted flex-1 min-w-0">
            Familia e trecută de birou și nu are încă un cont în portal.
          </p>
          <UButton
            v-if="profile.email"
            icon="i-lucide-send"
            class="min-h-11"
            :loading="claimBusy"
            @click="sendAccountClaim"
          >
            Trimite linkul de cont
          </UButton>
          <p v-else class="text-sm text-warning">
            Fără o adresă de email în fișă, linkul de cont nu are unde pleca.
          </p>
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

      <!--
        E07/S2 — the office side of the parent's switch: a consent signed on paper, or a withdrawal
        asked for on the phone. Each button names its child, so a family of three is three distinct
        controls to a screen reader rather than three identical ones.
      -->
      <UCard
        v-if="profile.children && profile.children.length > 0"
        class="border rounded-lg"
        variant="subtle"
      >
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-image" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Acorduri pentru lucrări</h2>
          </div>
        </template>

        <p v-if="consentsError" class="text-sm text-error">{{ consentsError }}</p>
        <div v-else-if="consents" class="space-y-3">
          <div
            v-for="child in consents.children"
            :key="child.childId"
            class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border rounded-lg p-3"
          >
            <div>
              <p class="font-medium">{{ child.firstName }} {{ child.lastName }}</p>
              <p class="text-sm text-muted">
                {{ consentSummary(consentFor(child, "promotion")) }}
              </p>
            </div>
            <UButton
              v-if="consentFor(child, 'promotion').inForce"
              color="error"
              variant="subtle"
              class="min-h-11 justify-center"
              :aria-label="`Retrage acordul pentru ${child.firstName} ${child.lastName}`"
              @click="askConsent(child, 'revoke')"
            >
              Retrage acordul
            </UButton>
            <UButton
              v-else
              variant="subtle"
              class="min-h-11 justify-center"
              :aria-label="`Consemnează acordul pentru ${child.firstName} ${child.lastName}`"
              @click="askConsent(child, 'grant')"
            >
              Consemnează acordul
            </UButton>
          </div>
          <p class="text-xs text-muted">
            {{ PURPOSE_LABELS.promotion }}: site, paginile școlii din rețelele sociale, prezentări.
            <NuxtLink to="/acord-lucrari" class="underline">Textul acordului</NuxtLink>
          </p>
        </div>
      </UCard>

      <AdminConfirmModal
        v-model:open="consentConfirmOpen"
        :title="consentAction === 'grant' ? 'Consemnează acordul' : 'Retrage acordul'"
        :confirm-label="consentAction === 'grant' ? 'Consemnează' : 'Retrage'"
        :danger="consentAction === 'revoke'"
        :loading="consentBusy"
        @confirm="confirmConsent"
      >
        <template #body>
          <p v-if="consentAction === 'grant'">
            Consemnezi că familia a acceptat ca lucrările făcute de
            <strong>{{ consentChild?.firstName }}</strong> să apară în materialele școlii. Fă asta
            doar cu formularul semnat în mână: familia primește un email care spune că acordul a
            fost consemnat de birou.
          </p>
          <p v-else>
            Retragi acordul pentru lucrările făcute de
            <strong>{{ consentChild?.firstName }}</strong
            >. Familia primește confirmarea, iar biroul un mesaj cu ce trebuie scos de pe site și
            din rețelele sociale.
          </p>
        </template>
      </AdminConfirmModal>

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
              @click="(event: MouseEvent) => bumpReferral(-1, event)"
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
              @click="(event: MouseEvent) => bumpReferral(1, event)"
            />
          </div>
        </div>
      </UCard>

      <!--
        E04/S5 and E22/S3 — the family's departure, and the day its data goes.

        A day somebody records, never one the platform infers: a family taking a term off is the one
        a guess would erase. The due day and the hold are the server's answer, like everything this
        page shows about money and terms.
      -->
      <UCard v-if="retentionTerms" class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-door-open" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Retragere</h2>
          </div>
        </template>

        <div v-if="retention" class="space-y-3">
          <p>
            Retrasă din <strong>{{ formatDateKey(retention.withdrawnAt) }}</strong
            >. Datele familiei se șterg singure pe
            <strong>{{ formatDateKey(retention.dueOn) }}</strong
            >; facturile rămân.
          </p>
          <UAlert
            v-if="retention.hold"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="RETENTION_HOLD_LABELS[retention.hold]"
          />
          <UButton
            color="neutral"
            variant="subtle"
            class="min-h-11"
            :loading="withdrawalBusy"
            @click="reinstate"
          >
            Anulează retragerea
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <p class="text-muted max-w-2xl">
            Consemnează ziua în care familia a plecat. După
            {{ retentionTerms.familyMonths }} luni de la ea, datele familiei se șterg singure —
            facturile rămân. Până atunci, retragerea se poate anula.
          </p>
          <div class="flex flex-wrap items-end gap-4">
            <UFormField name="withdrawnOn" label="Ziua retragerii">
              <AdminDateField v-model="withdrawnOn" :max="today" label="ziua retragerii" />
            </UFormField>
            <UButton
              color="warning"
              class="min-h-11"
              :loading="withdrawalBusy"
              :disabled="!withdrawnOn"
              @click="withdraw"
            >
              Consemnează retragerea
            </UButton>
          </div>
        </div>
      </UCard>

      <!--
        E07/S4 from the office's side. Terms §17 and the privacy notice §8 send families to the school
        by phone or email, and a family with no account can reach its data no other way: the export
        is the document the portal gives, and the request joins the same queue, where the erasure
        itself happens.
      -->
      <UCard v-if="profile && !profile.erasedAt" class="border rounded-lg" variant="subtle">
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-shield" class="text-2xl text-primary" />
            <h2 class="text-2xl font-semibold">Datele familiei</h2>
          </div>
        </template>

        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              color="neutral"
              variant="subtle"
              class="min-h-11"
              icon="i-lucide-download"
              :loading="exportBusy"
              @click="downloadExport"
            >
              Exportă datele familiei
            </UButton>
            <p class="text-sm text-muted">Același fișier pe care familia îl descarcă din portal.</p>
          </div>

          <div v-if="profile.erasureRequestedAt" class="space-y-3">
            <p>
              Familia a cerut ștergerea datelor pe
              <strong>{{ formatDateKey(todayKey(new Date(profile.erasureRequestedAt))) }}</strong
              >. Ștergerea se face din
              <NuxtLink to="/admin/stergeri" class="underline">Ștergeri</NuxtLink>.
            </p>
            <UButton
              color="neutral"
              variant="subtle"
              class="min-h-11"
              :loading="erasureBusy"
              @click="withdrawErasureRequest"
            >
              Retrage cererea familiei
            </UButton>
          </div>

          <div v-else class="space-y-3">
            <p class="text-muted max-w-2xl">
              Dacă familia a cerut ștergerea datelor la telefon, pe email sau la birou, consemnează
              cererea aici. Apare apoi în lista de ștergeri, iar cele 30 de zile curg de azi.
            </p>
            <div class="flex flex-wrap items-end gap-4">
              <UFormField name="erasureVia" label="Cum a cerut">
                <USelect v-model="erasureVia" :items="erasureChannelItems" class="min-w-44" />
              </UFormField>
              <UButton
                color="warning"
                class="min-h-11"
                :loading="erasureBusy"
                @click="recordErasure"
              >
                Consemnează cererea de ștergere
              </UButton>
            </div>
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
  </AdminPage>
</template>
<script setup lang="ts">
import { useDiscountsApi } from "~/composables/api/useDiscountsApi";
import {
  ERASURE_REQUEST_CHANNEL_LABELS,
  usePrivacyApi,
  type ErasureRequestChannel,
} from "~/composables/api/usePrivacyApi";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey, formatMonth } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { RETENTION_HOLD_LABELS } from "~/types/retention.types";
import type { RetentionRow, RetentionTerms } from "~/types/retention.types";
import type { Profile } from "~/types/profile.types";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { consentFor, consentSummary } from "~/composables/useConsent";
import { PURPOSE_LABELS } from "~/types/consent.types";
import type { ChildConsents, FamilyConsents } from "~/types/consent.types";

const route = useRoute();
const profileApi = useProfileApi();
const discountsApi = useDiscountsApi();
const privacyApi = usePrivacyApi();
const { success, error } = useNotifications();
const profile: Ref<Profile | null> = ref(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

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

const bumpReferral = async (direction: 1 | -1, event?: MouseEvent) => {
  // The second click of a double-click is not a second press. Each press is a month, so on a fast
  // connection — the first request answered before the second click landed, the button enabled
  // again — a double-click gave the family two (end-to-end testing, 25 September 2026). A click's
  // `detail` counts the clicks in a row; a deliberate second press, a moment later, starts at 1.
  if ((event?.detail ?? 1) > 1) return;
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

/**
 * The account-claim link — E11 S2, review of 26 September 2026. The server writes the link, mails
 * it to the address on file and keeps the trail; a second press replaces the first link.
 */
const claimBusy = ref(false);

const sendAccountClaim = async () => {
  if (!profile.value || claimBusy.value) return;
  claimBusy.value = true;
  try {
    await profileApi.sendAccountClaim(profile.value.id);
    success(
      "Linkul de cont a plecat.",
      `Familia îl primește la ${profile.value.email}; e valabil 48 de ore.`
    );
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut trimite linkul de cont."));
  } finally {
    claimBusy.value = false;
  }
};

/**
 * The withdrawal — E04/S5, with the term from E22/S3.
 *
 * Both the row and the terms come from the server: the due day is its arithmetic, and a second copy
 * of "twelve months" on this page would be free to disagree with the job that actually erases.
 */
const today = todayKey();
const retention = ref<RetentionRow | null>(null);
const retentionTerms = ref<RetentionTerms | null>(null);
const withdrawnOn = ref<string>(today);
const withdrawalBusy = ref(false);

const withdraw = async () => {
  if (!profile.value || withdrawalBusy.value) return;
  withdrawalBusy.value = true;
  try {
    const answer = await privacyApi.withdrawFamily(profile.value.id, withdrawnOn.value);
    retention.value = answer.row;
    success("Retragerea a fost consemnată.");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut consemna retragerea."));
  } finally {
    withdrawalBusy.value = false;
  }
};

const reinstate = async () => {
  if (!profile.value || withdrawalBusy.value) return;
  withdrawalBusy.value = true;
  try {
    await privacyApi.reinstateFamily(profile.value.id);
    retention.value = null;
    withdrawnOn.value = today;
    success("Retragerea a fost anulată.");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut anula retragerea."));
  } finally {
    withdrawalBusy.value = false;
  }
};

/**
 * The family's own data, from the office's side — E07/S4. The request only goes on file here; the
 * erasure is `/admin/stergeri`'s, with its thirty-day queue and its fiscal hold.
 */
const exportBusy = ref(false);
const erasureBusy = ref(false);
const erasureVia = ref<ErasureRequestChannel>("phone");
const erasureChannelItems = (
  Object.keys(ERASURE_REQUEST_CHANNEL_LABELS) as ErasureRequestChannel[]
).map((value) => ({ value, label: ERASURE_REQUEST_CHANNEL_LABELS[value] }));

const downloadExport = async () => {
  if (!profile.value || exportBusy.value) return;
  exportBusy.value = true;
  let url: string | null = null;
  try {
    const data = await privacyApi.fetchFamilyExport(profile.value.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `datele-familiei-${profile.value.id}-${today}.json`;
    anchor.click();
    success("Datele familiei s-au descărcat.");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut pregăti fișierul."));
  } finally {
    if (url) URL.revokeObjectURL(url);
    exportBusy.value = false;
  }
};

const recordErasure = async () => {
  if (!profile.value || erasureBusy.value) return;
  erasureBusy.value = true;
  try {
    const answer = await privacyApi.recordErasureRequest(profile.value.id, erasureVia.value);
    profile.value = { ...profile.value, erasureRequestedAt: answer.requestedAt };
    success("Cererea de ștergere a fost consemnată.", "Familia apare acum în lista de ștergeri.");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut consemna cererea."));
  } finally {
    erasureBusy.value = false;
  }
};

const withdrawErasureRequest = async () => {
  if (!profile.value || erasureBusy.value) return;
  erasureBusy.value = true;
  try {
    await privacyApi.withdrawErasureForFamily(profile.value.id);
    profile.value = { ...profile.value, erasureRequestedAt: null };
    success("Cererea de ștergere a fost retrasă.");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut retrage cererea."));
  } finally {
    erasureBusy.value = false;
  }
};

/**
 * The consents, child by child — E07/S2. The office records what a family signed on paper and
 * withdraws what a family asked on the phone; the family is written to either way, by the server.
 */
const consents = ref<FamilyConsents | null>(null);
const consentsError = ref<string | null>(null);
const consentConfirmOpen = ref(false);
const consentAction = ref<"grant" | "revoke">("grant");
const consentChild = ref<ChildConsents | null>(null);
const consentBusy = ref(false);

const askConsent = (child: ChildConsents, action: "grant" | "revoke") => {
  consentChild.value = child;
  consentAction.value = action;
  consentConfirmOpen.value = true;
};

const confirmConsent = async () => {
  const child = consentChild.value;
  if (!child || consentBusy.value) return;
  const action = consentAction.value;
  consentBusy.value = true;
  try {
    const updated =
      action === "grant"
        ? await privacyApi.grantConsent(child.childId)
        : await privacyApi.revokeConsent(child.childId);
    if (consents.value) {
      consents.value = {
        ...consents.value,
        children: consents.value.children.map((entry) =>
          entry.childId === updated.childId ? updated : entry
        ),
      };
    }
    consentConfirmOpen.value = false;
    success(
      action === "grant" ? "Acordul a fost consemnat." : "Acordul a fost retras.",
      action === "grant"
        ? "Familia primește confirmarea pe email."
        : "Familia și biroul primesc câte un email."
    );
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut salva acordul."));
  } finally {
    consentBusy.value = false;
  }
};

/**
 * The family, and the two ways it can fail to arrive.
 *
 * The fetch used to have no `catch` and the template no `v-else`, so a failed request left the
 * page blank — permanently, and identically to a family that does not exist. Both are now said
 * out loud, and they are said differently: a 404 is an answer, an unreachable API is not.
 */
const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    profile.value = (await profileApi.fetchProfile(route.params.profileId as string))[0] || null;
  } catch (err: unknown) {
    profile.value = null;
    loadError.value = apiErrorMessage(err, "Nu am putut încărca familia.");
    return;
  } finally {
    loading.value = false;
  }
  if (!profile.value) return;
  try {
    referralMonths.value = (await discountsApi.fetchReferralReward(profile.value.id)).months;
  } catch {
    // The reward is a detail on a page about a family; failing to read it leaves the control at
    // zero rather than replacing the profile with an error.
    referralMonths.value = [];
  }
  try {
    const answer = await privacyApi.fetchFamilyRetention(profile.value.id);
    retention.value = answer.row;
    retentionTerms.value = answer.terms;
  } catch {
    // Same judgement as the reward: without the answer the card is left out, rather than offering
    // a withdrawal on a page that could not say whether one is already recorded.
    retentionTerms.value = null;
  }
  consentsError.value = null;
  try {
    consents.value = await privacyApi.fetchFamilyConsents(profile.value.id);
  } catch (err: unknown) {
    // Said, not hidden: a consents card that silently vanished would read as a family with no
    // children to ask about, and "may we use this work" is the question it exists to answer.
    consents.value = null;
    consentsError.value = apiErrorMessage(err, "Nu am putut încărca acordurile.");
  }
};

onMounted(load);
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Profil",
});

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
</script>

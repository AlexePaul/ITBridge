<template>
  <div class="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Conturi în așteptare</h1>
        <p class="text-muted mt-1">
          Un cont de părinte devine activ doar după ce adresa e confirmată și tu îl aprobi.
        </p>
      </div>
      <UBadge color="primary" variant="subtle" size="lg" class="h-11 flex items-center px-4">
        {{ accounts.length }} în așteptare
      </UBadge>
    </div>

    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <UCard v-else-if="accounts.length === 0" class="border" variant="subtle">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-check-circle" class="text-3xl text-success" />
        <p class="font-medium">Nu așteaptă nimeni.</p>
        <p class="text-muted text-sm">
          Conturile noi apar aici imediat ce cineva se înregistrează. Primești și un email.
        </p>
      </div>
    </UCard>

    <UCard v-for="account in accounts" v-else :key="account.userId" class="border">
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1 space-y-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-lg">{{ fullName(account) }}</span>
            <UBadge
              :color="account.emailConfirmed ? 'success' : 'warning'"
              variant="subtle"
              size="sm"
            >
              {{ account.emailConfirmed ? "Email confirmat" : "Email neconfirmat" }}
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            <span class="font-mono">{{ account.username }}</span>
            <template v-if="account.email"> · {{ account.email }}</template>
            <template v-if="account.phone"> · {{ account.phone }}</template>
          </p>
          <p class="text-sm text-muted">Înregistrat {{ registeredAgo(account.createdAt) }}</p>
          <!--
            A row whose address is still unconfirmed is shown, not hidden. Approving it is allowed
            and the account still will not work until the parent opens their link — so the badge
            above is what tells an admin why a family they just approved still cannot sign in.
          -->
          <p v-if="!account.emailConfirmed" class="text-sm text-warning">
            Poți aproba acum, dar contul rămâne inactiv până când părintele deschide linkul primit
            pe email.
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <UButton
            color="primary"
            :loading="busyId === account.userId"
            :disabled="busyId !== null"
            @click="onApprove(account)"
          >
            Aprobă
          </UButton>
          <UButton
            color="error"
            variant="outline"
            :disabled="busyId !== null"
            @click="openReject(account)"
          >
            Respinge
          </UButton>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="rejectOpen" title="Respinge contul">
      <template #body>
        <div class="space-y-4">
          <p>
            Respingi contul lui <strong>{{ rejecting ? fullName(rejecting) : "" }}</strong
            >. Îi trimitem un email scurt, fără motivul de mai jos.
          </p>
          <UFormField label="Motiv (doar pentru admini)" hint="Opțional">
            <UInput v-model="rejectReason" placeholder="duplicat, cont de test…" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="rejectOpen = false">Renunță</UButton>
          <UButton color="error" :loading="busyId !== null" @click="onReject">Respinge</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useUserApi } from "~/composables/api/useUserApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import type { PendingAccount } from "~/types/user.types";

/**
 * The approvals queue — E11/S2, and the answer to the risk the epic names: two gates in front of a
 * family, and an admin who never opens the screen turns an enrolment into silence. The registration
 * email to the office points here.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Conturi în așteptare",
});

const { fetchPendingAccounts, approveAccount, rejectAccount } = useUserApi();
const { success, error: notifyError } = useNotifications();

const accounts = ref<PendingAccount[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busyId = ref<number | null>(null);

const rejectOpen = ref(false);
const rejecting = ref<PendingAccount | null>(null);
const rejectReason = ref("");

const fullName = (account: PendingAccount) =>
  [account.firstName, account.lastName].filter(Boolean).join(" ") || account.username;

/** "azi", "ieri", "acum 5 zile" — how long somebody has been waiting is the only useful reading. */
const registeredAgo = (createdAt: string) => {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "azi";
  if (days === 1) return "ieri";
  return `acum ${days} zile`;
};

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    accounts.value = (await fetchPendingAccounts()) ?? [];
  } catch (err) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca lista de conturi în așteptare.");
  } finally {
    loading.value = false;
  }
};

const onApprove = async (account: PendingAccount) => {
  busyId.value = account.userId;
  try {
    await approveAccount(account.userId);
    // Removed locally rather than by refetching: the row is gone from the queue by definition, and
    // a reload would make the list flicker for every approval in a batch.
    accounts.value = accounts.value.filter((row) => row.userId !== account.userId);
    success("Cont aprobat", `${fullName(account)} a fost anunțat prin email.`);
  } catch (err) {
    notifyError("Nu am putut aproba contul", apiErrorMessage(err));
  } finally {
    busyId.value = null;
  }
};

const openReject = (account: PendingAccount) => {
  rejecting.value = account;
  rejectReason.value = "";
  rejectOpen.value = true;
};

const onReject = async () => {
  const account = rejecting.value;
  if (!account) return;

  busyId.value = account.userId;
  try {
    await rejectAccount(account.userId, rejectReason.value);
    accounts.value = accounts.value.filter((row) => row.userId !== account.userId);
    rejectOpen.value = false;
    success("Cont respins", fullName(account));
  } catch (err) {
    notifyError("Nu am putut respinge contul", apiErrorMessage(err));
  } finally {
    busyId.value = null;
  }
};

onMounted(load);
</script>

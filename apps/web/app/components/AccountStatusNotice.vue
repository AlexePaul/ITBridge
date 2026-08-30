<template>
  <UCard
    v-if="notice"
    class="w-9/12 mx-auto border rounded-none mt-12 z-15 min-h-24"
    :class="notice.tone === 'warning' ? 'border-warning' : 'border-info'"
    variant="subtle"
  >
    <div
      class="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 py-2"
    >
      <div class="flex items-center gap-2 sm:flex-1">
        <UIcon
          :name="notice.icon"
          class="shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
          :class="notice.tone === 'warning' ? 'text-warning' : 'text-info'"
        />
        <div>
          <p class="font-bold text-lg">{{ notice.title }}</p>
          <p class="text-sm">{{ notice.body }}</p>
        </div>
      </div>

      <UButton
        v-if="notice.canResend"
        color="warning"
        variant="outline"
        :loading="resending"
        class="whitespace-nowrap self-start sm:self-center"
        @click="onResend"
      >
        Trimite din nou linkul
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useUserStore } from "~/stores/userStore";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";


/**
 * What a parent sees while their account is still behind one of the two gates from E11/S2.
 *
 * Without it, a family that registered on a Friday signs in to an empty dashboard: no children, no
 * invoices, no explanation — which reads as a broken site rather than as "we have not got to you
 * yet". The epic calls that out as the cost of having two gates, and this is the other half of the
 * answer, the first being the email to the office.
 *
 * Nothing is shown for an active account, and nothing for an admin.
 */
const userStore = useUserStore();
const { resendConfirmation } = useAuthApi();
const { success, error: notifyError } = useNotifications();

const resending = ref(false);

interface Notice {
  tone: "warning" | "info";
  icon: string;
  title: string;
  body: string;
  canResend: boolean;
}

const notice = computed<Notice | null>(() => {
  const user = userStore.user;
  if (!user || user.role === "ADMIN" || user.active) return null;

  // Compared against the literal rather than an imported enum member: `ApprovalStatus` in the
  // contract is a union of string literals and has no runtime half — see the note on it.
  if (user.approvalStatus === "REJECTED") {
    return {
      tone: "warning",
      icon: "i-lucide-alert-circle",
      title: "Contul nu a fost activat.",
      body: "Dacă ți se pare o greșeală, scrie-ne și ne uităm încă o dată.",
      canResend: false,
    };
  }

  if (!user.emailConfirmed) {
    return {
      tone: "warning",
      icon: "i-lucide-mail",
      title: "Confirmă-ți adresa de email.",
      body: "Ți-am trimis un link la înregistrare. Dacă nu îl găsești, verifică și în spam sau cere unul nou.",
      canResend: true,
    };
  }

  return {
    tone: "info",
    icon: "i-lucide-clock",
    title: "Contul tău așteaptă aprobarea noastră.",
    body: "Adresa e confirmată. Te anunțăm pe email imediat ce contul e activ — de obicei în aceeași zi lucrătoare.",
    canResend: false,
  };
});

const onResend = async () => {
  resending.value = true;
  try {
    await resendConfirmation();
    success("Am trimis linkul din nou", "Verifică-ți emailul, inclusiv folderul de spam.");
  } catch (err) {
    notifyError("Nu am putut trimite linkul", apiErrorMessage(err));
  } finally {
    resending.value = false;
  }
};
</script>

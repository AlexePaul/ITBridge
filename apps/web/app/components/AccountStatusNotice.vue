<template>
  <section v-if="gates" class="portal-notice" aria-labelledby="gates-heading">
    <h2 id="gates-heading" class="portal-label">Contul tău</h2>

    <div class="portal-grid portal-grid-wide gates-grid">
      <!-- Gate one: the parent confirms their address. -->
      <div class="portal-card" :class="{ 'portal-card-accent': !gates.emailDone }">
        <span v-if="gates.emailDone" class="portal-label portal-done">
          <UIcon name="i-lucide-check" class="gate-tick" />
          Confirmat
        </span>
        <span v-else class="portal-label">De confirmat — la tine</span>

        <p class="portal-card-title">Adresa ta de email</p>

        <p v-if="gates.emailDone" class="body-text">Adresa ta de email este confirmată.</p>
        <p v-else class="body-text">
          Ți-am trimis un link de confirmare. Deschide-l ca să confirmi adresa — verifică și dosarul
          de spam.
        </p>

        <button
          v-if="!gates.emailDone"
          type="button"
          class="btn btn-primary gate-action"
          :disabled="resending"
          @click="onResend"
        >
          {{ resending ? "Se trimite…" : "Retrimite linkul" }}
        </button>
      </div>

      <!-- Gate two: an admin recognises the family. Nothing for the parent to do. -->
      <div class="portal-card">
        <span v-if="gates.schoolDone" class="portal-label portal-done">
          <UIcon name="i-lucide-check" class="gate-tick" />
          Confirmat
        </span>
        <span v-else-if="gates.rejected" class="portal-label">Nu am putut confirma</span>
        <span v-else class="portal-label muted-label">În lucru — la școală</span>

        <p class="portal-card-title">Recunoașterea familiei</p>

        <p v-if="gates.schoolDone" class="body-text">Școala a legat contul de familia ta.</p>
        <p v-else-if="gates.rejected" class="body-text">
          Dacă ți se pare o greșeală, scrie-ne sau sună la
          <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> și ne uităm încă o
          dată.
        </p>
        <p v-else class="body-text">
          Un coleg confirmă că ești în evidența școlii. Nu trebuie să faci nimic.
        </p>
      </div>
    </div>

    <!--
      What is actually blocked, said plainly. E11/S2 is explicit that an unconfirmed parent can sign
      in and that the only thing the two gates hold up is placing a child in a group — so a page that
      merely said "your account is pending" would describe a locked door that is not locked, and a
      parent would stop looking for the invoice that is right there.
    -->
    <p class="portal-empty">
      Până se închid amândouă, un singur lucru nu e disponibil:
      <strong>înscrierea unui copil într-o grupă</strong>. Restul contului funcționează normal.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useUserStore } from "~/stores/userStore";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * The two gates a new parent's account sits behind — E11/S2, drawn as screen 6c of the E18/S4
 * design.
 *
 * **Two cards, not one status line.** The gates are two independent columns on `User` and either can
 * close first; a single sentence would have to pick one of four states to describe and would be
 * wrong about the other three. Side by side, any combination reads correctly without this component
 * having to know which combination it is in.
 *
 * Nothing is shown for an active account, and nothing for an admin — nobody confirms or approves
 * them.
 */
const userStore = useUserStore();
const { resendConfirmation } = useAuthApi();
const { success, error: notifyError } = useNotifications();

const resending = ref(false);

const gates = computed(() => {
  const user = userStore.user;
  if (!user || user.role === "ADMIN" || user.active) return null;

  // Compared against the literal rather than an imported enum member: `ApprovalStatus` in the
  // contract is a union of string literals and has no runtime half — see the note on it in CLAUDE.md.
  return {
    emailDone: Boolean(user.emailConfirmed),
    schoolDone: user.approvalStatus === "APPROVED",
    rejected: user.approvalStatus === "REJECTED",
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

<style scoped>
.gates-grid {
  margin-top: var(--space-4);
}

.gate-tick {
  width: 14px;
  height: 14px;
  color: var(--color-accent);
}

.gate-action {
  align-self: flex-start;
  min-height: 44px;
  margin-top: var(--space-1);
}

/* The school's side is not addressed to the reader, so its label does not take the accent the
   reader's own to-do does. */
.muted-label {
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}
</style>

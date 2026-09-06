<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Profil</h1>
    </div>

    <p v-if="!profile" class="portal-empty">
      Nu am putut încărca datele profilului.
      <button type="button" class="link link-button" @click="loadProfile">Încearcă din nou</button>
    </p>

    <template v-else>
      <div class="portal-section portal-grid portal-grid-wide">
        <div>
          <h2 class="portal-label">Datele tale</h2>
          <dl class="portal-dl details">
            <div class="portal-dl-row">
              <dt>Nume</dt>
              <dd>{{ profile.firstName }} {{ profile.lastName }}</dd>
            </div>
            <div class="portal-dl-row">
              <dt>Email</dt>
              <dd>
                {{ profile.email || "—" }}
                <template v-if="profile.email && emailConfirmed"> — confirmat</template>
              </dd>
            </div>
            <div class="portal-dl-row">
              <dt>Telefon</dt>
              <dd>{{ profile.phone || "—" }}</dd>
            </div>
            <div class="portal-dl-row">
              <dt>Adresă</dt>
              <dd>{{ profile.address || "—" }}</dd>
            </div>
            <div class="portal-dl-row">
              <dt>Contact de urgență</dt>
              <dd>{{ emergencyContact }}</dd>
            </div>
          </dl>

          <NuxtLink to="/user/profile-setup" class="btn btn-primary details-action">
            Modifică datele
          </NuxtLink>
        </div>

        <div>
          <h2 class="portal-label">Copiii înregistrați</h2>

          <p v-if="!profile.children || profile.children.length === 0" class="portal-empty">
            Încă nu e niciun copil înregistrat pe contul tău.
          </p>

          <div v-else class="children">
            <div v-for="child in profile.children" :key="child.id" class="child-row">
              <p class="portal-when">{{ child.firstName }} {{ child.lastName }}</p>
              <p class="portal-where">născut(ă) pe {{ formatDateKey(child.birthDate) }}</p>
              <p v-if="child.group" class="portal-where">
                {{ child.group.name }} · {{ getWeekdayName(child.group.weekday).toLowerCase() }}
                {{ formatTime(child.group.startTime) }}–{{ formatTime(child.group.endTime) }}
                <template v-if="child.group.room?.location">
                  · {{ child.group.room.location.name }}
                </template>
              </p>
              <p v-else class="portal-where">Încă nu e repartizat(ă) într-o grupă.</p>
            </div>
          </div>

          <p class="note">
            Pentru schimbarea grupei sau orice altă modificare, scrie-ne sau sună la
            <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
            >.
          </p>
        </div>
      </div>

      <!--
        The one preference a parent has, and the one sentence that stops it from being frightening.
        E17/S4 is explicit that `marketingOptIn` gates marketing and nothing else — `queue` and
        `queueOrRecord` are never given the preference at all — so nobody can lose an invoice, a
        cancelled class or their child's work by unticking this. Saying so is the point of the
        paragraph: without it, the safe move for a parent is to leave ticked a box they did not want.
      -->
      <section class="portal-section marketing">
        <h2 class="portal-label">Email promoțional</h2>

        <div class="opt-in">
          <input
            id="marketing-opt-in"
            type="checkbox"
            :checked="profile.marketingOptIn"
            :disabled="saving"
            @change="onToggle"
          />
          <div>
            <label for="marketing-opt-in" class="opt-in-label">
              Vreau să primesc noutăți și oferte prin email.
            </label>
            <p class="body-text opt-in-note">
              Setarea acoperă <strong>doar mesajele promoționale</strong>. Facturile, confirmările
              de absență, orele anulate și noutățile despre proiectele copiilor ajung la tine oricum
              — nu depind de această bifă.
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey } from "~/composables/useAdminFormat";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Profil — E18/S4, screen 5.
 *
 * Family-level, like Plăți: contact details, the registered children, and the single marketing
 * opt-in. No child switcher, because nothing here belongs to one child.
 *
 * The profile-id and child-count rows the old screen carried are gone. A profile id is an internal
 * number a parent can do nothing with, and "number of children" counts a list printed directly
 * above it.
 */
definePageMeta({
  title: "Profil",
  layout: "portal" as any,
});

const profileApi = useProfileApi();
const profileStore = useProfileStore();
const userStore = useUserStore();
const { success, error: notifyError } = useNotifications();

const saving = ref(false);

const profile = computed(() => profileStore.profile);
const emailConfirmed = computed(() => Boolean(userStore.user?.emailConfirmed));

/**
 * Assembled here rather than split into three rows, because it is one fact: who to call. Partial
 * records are normal — a profile an admin typed in from a phone call has none of it — and three rows
 * each reading "—" say less than one line admitting it is not filled in.
 */
const emergencyContact = computed(() => {
  const p = profile.value;
  if (!p?.emergencyContactName) return "Nu e completat";
  const relation = p.emergencyContactRelation ? ` (${p.emergencyContactRelation})` : "";
  const phone = p.emergencyContactPhone ? ` — ${p.emergencyContactPhone}` : "";
  return `${p.emergencyContactName}${relation}${phone}`;
});

const loadProfile = async () => {
  try {
    await profileApi.fetchProfile();
  } catch (err) {
    notifyError("Nu am putut încărca profilul", apiErrorMessage(err));
  }
};

onMounted(async () => {
  // The layout fetches it once, for the header. Only ask again if that did not land.
  if (!profileStore.profile) await loadProfile();
});

/**
 * Saved on the tick, not behind a "save" button.
 *
 * A consent checkbox that needs a second press to take effect is one a parent can leave believing
 * they have withdrawn consent when they have not. The input is bound to the stored value rather than
 * to local state, so a failed request leaves it showing what the server actually holds.
 */
const onToggle = async (event: Event) => {
  const current = profile.value;
  if (!current) return;
  const next = (event.target as HTMLInputElement).checked;

  saving.value = true;
  try {
    await profileApi.updateProfile({ marketingOptIn: next }, current.id);
    success(
      next ? "Îți trimitem noutățile." : "Nu-ți mai trimitem mesaje promoționale.",
      "Facturile și mesajele despre orele copiilor nu se schimbă."
    );
  } catch (err) {
    notifyError("Nu am putut salva preferința", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.details {
  margin-top: var(--space-2);
}

.details-action {
  min-height: 44px;
  margin-top: var(--space-4);
}

.children {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
}

.child-row {
  padding-block: var(--space-4);
  border-bottom: 1px solid var(--color-divider);
}

.child-row .portal-where {
  margin-top: 4px;
}

.marketing {
  max-width: 640px;
}

.opt-in {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

/* 22px rather than the browser default, so the box is a real target beside a two-line label, and
   the accent is the tick rather than a repainted control. */
.opt-in input {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 3px;
  accent-color: var(--color-accent);
}

.opt-in-label {
  display: block;
  font-size: 15.5px;
  line-height: 26px;
  cursor: pointer;
}

.opt-in-note {
  margin-top: var(--space-2);
}

/* The retry inside a sentence is a button, and reads as the link it looks like. */
.link-button {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
</style>

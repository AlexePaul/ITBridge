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

      <!--
        Changing the password from inside the account.

        The current password is asked for, and is not ceremony: an access token is honoured for
        fifteen minutes without the server consulting `sessions`, so a tab left open on a shared
        machine reaches this form. What only the owner knows is what keeps the change out of reach
        of whoever merely has the screen open.

        The repetition is checked here and nowhere else — the server has only one password to go
        on, so a mistyped second field is a thing only this screen can catch, and it is the one that
        would lock a parent out of their own account.
      -->
      <section class="portal-section">
        <h2 class="portal-label">Parola</h2>

        <p class="body-text">
          După schimbare te deconectăm de pe toate dispozitivele, inclusiv de aici — te autentifici
          din nou cu parola nouă.
        </p>

        <form class="form" @submit.prevent="onChangePassword">
          <div class="field">
            <label for="current-password">Parola actuală</label>
            <input
              id="current-password"
              v-model="currentPassword"
              class="input"
              type="password"
              autocomplete="current-password"
            />
          </div>
          <div class="field">
            <label for="new-password">Parola nouă</label>
            <input
              id="new-password"
              v-model="newPassword"
              class="input"
              type="password"
              autocomplete="new-password"
              :placeholder="`Cel puțin ${MIN_PASSWORD_LENGTH} caractere`"
            />
          </div>
          <div class="field">
            <label for="new-password-confirm">Repetă parola nouă</label>
            <input
              id="new-password-confirm"
              v-model="newPasswordConfirmation"
              class="input"
              type="password"
              autocomplete="new-password"
            />
          </div>
          <button
            type="submit"
            class="btn btn-secondary details-action"
            :disabled="changingPassword"
          >
            {{ changingPassword ? "Se schimbă…" : "Schimbă parola" }}
          </button>
        </form>
      </section>

      <!--
        E07/S4. The right of access, as a button rather than as an email to the office.

        The file is built in the browser from the JSON the server returns, so nothing is written to
        disk on our side and no link needs signing. `URL.revokeObjectURL` runs in `finally`: the
        anchor is gone the moment the click is handled, and the blob would otherwise be held for the
        life of the tab.
      -->
      <section class="portal-section">
        <!--
          Not "Datele tale": that heading is already the contact block at the top of this page, and
          two identical headings on one screen are two identical entries in the list a screen reader
          navigates by — the same failure the admin sweep found in twenty rows called „Acțiuni".
        -->
        <h2 class="portal-label">Copia datelor tale</h2>

        <p class="body-text">
          Poți descărca tot ce ține școala despre tine și despre copiii tăi — datele de contact,
          înscrierile, prezențele, facturile, plățile și proiectele. Fișierul e al tău; noi nu-l
          păstrăm.
        </p>

        <button
          type="button"
          class="btn btn-secondary details-action"
          :disabled="downloading"
          @click="onDownload"
        >
          {{ downloading ? "Se pregătește…" : "Descarcă datele mele" }}
        </button>
      </section>

      <!--
        E07/S4, the second right. Two presses, not one: a control that empties an account on the
        first click is a control somebody empties an account with by accident, and there is nothing
        on the other side of it. The request is also not the deletion — the office has up to thirty
        days, and has to check what the accounting obligation keeps — so the copy says what will
        happen rather than implying it already has.

        No colour of its own. The palette has no danger token, and a hex written here would be a
        colour with no dark-mode counterpart — the thing `themed-colours.spec.ts` exists to stop.
        What makes this safe is the second press, not a red border.
      -->
      <section class="portal-section">
        <h2 class="portal-label">Ștergerea contului</h2>

        <template v-if="erasureRequestedAt">
          <p class="body-text">
            Am primit cererea ta pe {{ formatDateKey(erasureRequestedAt.slice(0, 10)) }}. Ștergem
            datele în cel mult 30 de zile. Îți rămân doar facturile, fiindcă legea ne obligă să
            păstrăm evidența plăților.
          </p>
          <button
            type="button"
            class="btn btn-secondary details-action"
            :disabled="erasing"
            @click="onWithdraw"
          >
            Renunț la cerere
          </button>
        </template>

        <template v-else>
          <p class="body-text">
            Poți cere ștergerea contului tău și a datelor copiilor. Îți rămân doar facturile,
            fiindcă legea ne obligă să păstrăm evidența plăților; restul dispare, iar contul nu se
            mai poate folosi.
          </p>
          <button
            type="button"
            class="btn btn-secondary details-action"
            :disabled="erasing"
            @click="onRequestErasure"
          >
            {{ confirmingErasure ? "Sigur? Apasă din nou" : "Cere ștergerea contului" }}
          </button>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { usePrivacyApi } from "~/composables/api/usePrivacyApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useClassSessionStore } from "~/stores/classSessionStore";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { dayKey } from "~/composables/useUtils";
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
const authApi = useAuthApi();
const privacyApi = usePrivacyApi();
const profileStore = useProfileStore();
const userStore = useUserStore();
const tokenStore = useTokenStore();
const childrenStore = useChildrenStore();
const attendanceStore = useAttendanceStore();
const classSessionStore = useClassSessionStore();
const { success, error: notifyError } = useNotifications();

const saving = ref(false);
const downloading = ref(false);
const changingPassword = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const newPasswordConfirmation = ref("");

/** Mirrors `MIN_PASSWORD_LENGTH` on the server, which mirrors what registration accepts. */
const MIN_PASSWORD_LENGTH = 6;
const erasing = ref(false);
/** First press arms, second one asks. Reset on success, on failure and on leaving the screen. */
const confirmingErasure = ref(false);

const erasureRequestedAt = computed(() => profile.value?.erasureRequestedAt ?? null);

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
/**
 * Builds the file in the browser and hands it over.
 *
 * A date in the name because a family may ask twice, months apart, and two files called
 * `datele-mele.json` in a downloads folder are one file as far as anybody can tell.
 */
const onDownload = async () => {
  downloading.value = true;
  let url: string | null = null;
  try {
    const data = await privacyApi.fetchOwnExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `datele-mele-${dayKey()}.json`;
    anchor.click();

    success("Datele tale s-au descărcat.", "Fișierul e în folderul de descărcări.");
  } catch (err) {
    notifyError("Nu am putut pregăti fișierul", apiErrorMessage(err));
  } finally {
    if (url) URL.revokeObjectURL(url);
    downloading.value = false;
  }
};

const onRequestErasure = async () => {
  if (!confirmingErasure.value) {
    confirmingErasure.value = true;
    return;
  }

  erasing.value = true;
  try {
    await privacyApi.requestErasure();
    await profileApi.fetchProfile();
    success(
      "Am primit cererea.",
      "Ștergem datele în cel mult 30 de zile. Poți renunța oricând până atunci."
    );
  } catch (err) {
    notifyError("Nu am putut trimite cererea", apiErrorMessage(err));
  } finally {
    confirmingErasure.value = false;
    erasing.value = false;
  }
};

const onWithdraw = async () => {
  erasing.value = true;
  try {
    await privacyApi.withdrawErasure();
    await profileApi.fetchProfile();
    success("Am anulat cererea.", "Contul rămâne așa cum e.");
  } catch (err) {
    notifyError("Nu am putut anula cererea", apiErrorMessage(err));
  } finally {
    erasing.value = false;
  }
};

/**
 * Sends the change, then leaves.
 *
 * The server revokes every session, this browser's included, so staying on the page would mean
 * holding tokens that have already stopped meaning anything — the next request would 401 and the
 * parent would read it as the change having failed. Logging out and going to the login form says
 * what happened instead.
 */
const onChangePassword = async () => {
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    notifyError(
      "Parola e prea scurtă",
      `Alege o parolă de cel puțin ${MIN_PASSWORD_LENGTH} caractere.`
    );
    return;
  }
  if (newPassword.value !== newPasswordConfirmation.value) {
    notifyError("Parolele nu sunt identice", "Repetă parola nouă exact cum ai scris-o mai sus.");
    return;
  }

  changingPassword.value = true;
  try {
    await authApi.changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    newPasswordConfirmation.value = "";
    success("Parola a fost schimbată.", "Autentifică-te din nou cu parola nouă.");
    // Not `useLogout()`: that one calls `POST /auth/logout` to revoke a refresh token the change
    // has already revoked, and announces itself with a second toast. The caches go all the same —
    // what is in them belongs to a session that no longer exists.
    tokenStore.clearTokens();
    userStore.logout();
    profileStore.clearProfile();
    childrenStore.clearChildren();
    attendanceStore.clearAttendance();
    classSessionStore.clearSessions();
    await navigateTo("/auth/login");
  } catch (err) {
    notifyError("Nu am putut schimba parola", apiErrorMessage(err));
  } finally {
    changingPassword.value = false;
  }
};

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

/* 44px is the minimum target on the parent's path — E18/S7 — and both controls on this page that
   sit under a block of text share it. */
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

<template>
  <form class="form child-form" novalidate @submit.prevent="onSubmit">
    <div class="field-row">
      <div class="field">
        <label :for="`${idPrefix}-first-name`">Prenumele copilului</label>
        <input
          :id="`${idPrefix}-first-name`"
          ref="firstField"
          v-model="form.firstName"
          class="input"
          type="text"
          autocomplete="off"
          :aria-invalid="Boolean(errors.firstName)"
          :aria-describedby="errors.firstName ? `${idPrefix}-first-name-error` : undefined"
        />
        <p v-if="errors.firstName" :id="`${idPrefix}-first-name-error`" class="field-error">
          {{ errors.firstName }}
        </p>
      </div>
      <div class="field">
        <label :for="`${idPrefix}-last-name`">Numele de familie</label>
        <input
          :id="`${idPrefix}-last-name`"
          v-model="form.lastName"
          class="input"
          type="text"
          autocomplete="off"
          :aria-invalid="Boolean(errors.lastName)"
          :aria-describedby="errors.lastName ? `${idPrefix}-last-name-error` : undefined"
        />
        <p v-if="errors.lastName" :id="`${idPrefix}-last-name-error`" class="field-error">
          {{ errors.lastName }}
        </p>
      </div>
    </div>

    <div class="field">
      <label :for="`${idPrefix}-birth`">Data nașterii</label>
      <input
        :id="`${idPrefix}-birth`"
        v-model="form.birthDate"
        class="input"
        type="date"
        :max="today"
        :aria-invalid="Boolean(errors.birthDate)"
        :aria-describedby="errors.birthDate ? `${idPrefix}-birth-error` : `${idPrefix}-birth-help`"
      />
      <p :id="`${idPrefix}-birth-help`" class="field-hint">
        Din ea știm ce grupe i se potrivesc. Nu cerem CNP și nici alte acte.
      </p>
      <p v-if="errors.birthDate" :id="`${idPrefix}-birth-error`" class="field-error">
        {{ errors.birthDate }}
      </p>
    </div>

    <div class="child-form-actions">
      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? "Se salvează…" : submitLabel }}
      </button>
      <button type="button" class="btn btn-ghost" :disabled="saving" @click="emit('cancel')">
        Renunță
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { checkChildForm, type ChildFormErrors } from "~/composables/useChildForm";
import type { Child } from "~/types/child.types";

/**
 * Adds a child to the family, or corrects one — terms §5 and §6, privacy notice §8: „datele de
 * contact și ale copiilor le corectezi singur din portal".
 *
 * One component for both, because they are one form: the three fields terms §5 names and nothing
 * else. With `child` it corrects that child; without, it adds one to `parentId`, which the server
 * checks is the signed-in family's own. The server's refusals arrive in Romanian (`CreateChildDto`)
 * and are shown as written. Adding a child does not enrol it: only the school does that, with the
 * contract (§5), and the page around this form says so.
 */
const props = defineProps<{
  parentId: number;
  child?: Pick<Child, "id" | "firstName" | "lastName" | "birthDate">;
  submitLabel: string;
}>();

const emit = defineEmits<{
  saved: [child: Child];
  cancel: [];
}>();

const childrenApi = useChildrenApi();
const { success, error: notifyError } = useNotifications();

/** Unique per instance: the page can show this form for a child while another child's row is listed. */
const idPrefix = props.child ? `child-${props.child.id}` : "child-new";
const today = todayKey();

const form = reactive({
  firstName: props.child?.firstName ?? "",
  lastName: props.child?.lastName ?? "",
  // A day key on the wire already; the slice only guards against a timestamp ever arriving.
  birthDate: props.child ? String(props.child.birthDate).slice(0, 10) : "",
});
const errors = reactive<ChildFormErrors>({});
const saving = ref(false);
const firstField = ref<HTMLInputElement | null>(null);

/** Opened by a button, so the keyboard lands in the form instead of staying on the button behind it. */
onMounted(async () => {
  await nextTick();
  firstField.value?.focus();
});

const onSubmit = async () => {
  const { errors: found, data } = checkChildForm(form, today);
  errors.firstName = found.firstName;
  errors.lastName = found.lastName;
  errors.birthDate = found.birthDate;
  if (!data) return;

  saving.value = true;
  try {
    const payload = { ...data, parentId: props.parentId };
    const saved = props.child
      ? await childrenApi.updateChild(props.child.id, data)
      : await childrenApi.createChild(payload);
    if (props.child) {
      success("Am salvat datele copilului.");
    } else {
      success(
        `Am adăugat în cont copilul ${data.firstName} ${data.lastName}.`,
        "Grupa o alegem împreună — te contactăm noi."
      );
    }
    emit("saved", saved);
  } catch (err) {
    notifyError(
      props.child ? "Nu am putut salva datele copilului" : "Nu am putut adăuga copilul",
      apiErrorMessage(err)
    );
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.child-form {
  max-width: none;
  margin-block: var(--space-4);
}

.child-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

/* 44px on the parent's path — E18/S7. */
.child-form-actions .btn {
  min-height: 44px;
}
</style>

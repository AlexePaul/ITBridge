<template>
  <div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
    <div>
      <h1 class="text-3xl font-bold">Încă un pas</h1>
      <p class="text-muted mt-2">
        {{
          hasName
            ? `Bine te-am găsit, ${profileStore.profile?.firstName}. Ne mai lipsesc câteva date înainte să putem primi copilul la o grupă.`
            : "Ne mai lipsesc câteva date înainte să putem primi copilul la o grupă."
        }}
      </p>
    </div>

    <UCard variant="subtle" class="border">
      <UForm :schema="schema" :state="state" class="space-y-5" @submit="handleSubmit">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField name="lastName" label="Nume" required>
            <UInput v-model="state.lastName" class="w-full" :ui="{ base: 'w-full min-h-11' }" />
          </UFormField>
          <UFormField name="firstName" label="Prenume" required>
            <UInput v-model="state.firstName" class="w-full" :ui="{ base: 'w-full min-h-11' }" />
          </UFormField>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UFormField name="email" label="Email" required>
            <UInput
              v-model="state.email"
              type="email"
              class="w-full"
              :ui="{ base: 'w-full min-h-11' }"
            />
          </UFormField>
          <UFormField name="phone" label="Număr de telefon" required>
            <UInput
              v-model="state.phone"
              type="tel"
              class="w-full"
              :ui="{ base: 'w-full min-h-11' }"
            />
          </UFormField>
        </div>

        <UFormField name="address" label="Adresă" required>
          <UInput v-model="state.address" class="w-full" :ui="{ base: 'w-full min-h-11' }" />
        </UFormField>

        <!-- The half that was missing entirely. `UpdateProfileDto` had no fields for it, so this
             form could not have sent it even if it had asked — a family who arrived through this
             door ended up without the emergency contact registration treats as mandatory. -->
        <div class="border-muted space-y-4 border-t pt-5">
          <div>
            <h2 class="font-semibold">Contact de urgență</h2>
            <p class="text-muted mt-1 text-sm">
              Pe cine sunăm dacă se întâmplă ceva la oră și nu te găsim pe tine.
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField name="emergencyContactName" label="Nume și prenume" required>
              <UInput
                v-model="state.emergencyContactName"
                class="w-full"
                :ui="{ base: 'w-full min-h-11' }"
              />
            </UFormField>
            <UFormField name="emergencyContactRelation" label="Ce îi este copilului" required>
              <UInput
                v-model="state.emergencyContactRelation"
                placeholder="bunică, unchi, vecin…"
                class="w-full"
                :ui="{ base: 'w-full min-h-11' }"
              />
            </UFormField>
          </div>

          <UFormField name="emergencyContactPhone" label="Telefon" required>
            <UInput
              v-model="state.emergencyContactPhone"
              type="tel"
              class="w-full md:max-w-xs"
              :ui="{ base: 'w-full min-h-11' }"
            />
          </UFormField>
        </div>

        <div class="flex justify-end">
          <UButton type="submit" :loading="saving" class="min-h-11">Salvează</UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";
import { useNotifications } from "~/composables/useNotifications";
import { isRomanianPhone, normalizePhone } from "~/composables/useUtils";
import { apiErrorMessage } from "~/composables/useApiError";

/**
 * Step two of registration — E11/S2, revised.
 *
 * `register` now writes a shell profile with a name and an email, so this screen **updates** rather
 * than creates: `createProfile` would collide with the row that already exists. It is reached in
 * two situations that look different and must both read sensibly — right after signing up, where it
 * really is the second half of one act, and much later, for a family the school entered from a
 * phone call whose account was linked afterwards. Hence the greeting adapts and nothing here calls
 * itself "step 2 of 2": for the second reader that would be a lie about a journey they never took.
 *
 * Every field is required, which is the whole point of the split. The screen this replaces made
 * them optional, and that is the defect E11/S2 was written to fix.
 */
definePageMeta({
  layout: "dashboard" as any,
  title: "Completează profilul",
});

const profileApi = useProfileApi();
const profileStore = useProfileStore();
const userStore = useUserStore();
const { error, success } = useNotifications();

const saving = ref(false);
const hasName = computed(() => Boolean(profileStore.profile?.firstName));

const schema = z.object({
  email: z.string().email("Adresa de email nu este validă"),
  // Was `exactly 10 characters`, which accepted only `0712345678` — while the API demanded
  // international format, so no value satisfied both and this form could never be submitted.
  // Both spellings are valid now, on either side.
  phone: z
    .string()
    .min(1, "Numărul de telefon este obligatoriu")
    .refine(isRomanianPhone, "Număr de telefon invalid (ex. 0712345678)"),
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  address: z.string().min(1, "Adresa este obligatorie"),
  emergencyContactName: z.string().min(1, "Numele persoanei de contact este obligatoriu"),
  emergencyContactRelation: z.string().min(1, "Spune-ne ce îi este copilului"),
  emergencyContactPhone: z
    .string()
    .min(1, "Numărul de telefon este obligatoriu")
    .refine(isRomanianPhone, "Număr de telefon invalid (ex. 0712345678)"),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
  emergencyContactName: "",
  emergencyContactRelation: "",
  emergencyContactPhone: "",
});

// Whatever the school already knows is filled in rather than asked for again: `register` wrote the
// name and the email, and an admin taking a family by phone may have written more.
onMounted(() => {
  const profile = profileStore.profile;
  if (!profile) return;
  state.email = profile.email ?? "";
  state.phone = profile.phone ?? "";
  state.firstName = profile.firstName ?? "";
  state.lastName = profile.lastName ?? "";
  state.address = profile.address ?? "";
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  const profileId = profileStore.profile?.id;
  if (!profileId) {
    error("Nu găsim profilul contului. Reîncarcă pagina și încearcă din nou.");
    return;
  }

  const payload: Partial<Profile> = {
    email: event.data.email,
    phone: normalizePhone(event.data.phone),
    firstName: event.data.firstName,
    lastName: event.data.lastName,
    address: event.data.address.trim(),
    emergencyContactName: event.data.emergencyContactName.trim(),
    emergencyContactRelation: event.data.emergencyContactRelation.trim(),
    emergencyContactPhone: normalizePhone(event.data.emergencyContactPhone),
  };

  saving.value = true;
  try {
    await profileApi.updateProfile(payload, profileId);
    // The redirect middleware reads `profileComplete` off `/auth/me`, so the account has to be
    // re-read before navigating — otherwise the parent is bounced straight back to this form.
    await userStore.fetchUser();
    success("Îți mulțumim! Profilul e complet.");
    await navigateTo("/");
  } catch (err) {
    error(apiErrorMessage(err, "Nu am putut salva profilul. Încearcă din nou."));
  } finally {
    saving.value = false;
  }
}
</script>

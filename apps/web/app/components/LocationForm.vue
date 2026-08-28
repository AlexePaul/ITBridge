<template>
  <UForm :schema="schema" :state="state" class="space-y-6" @submit="onSubmit">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UFormField name="name">
        <template #label>Nume<span class="text-error">*</span></template>
        <UInput v-model="state.name" placeholder="Drumul Taberei" />
      </UFormField>

      <UFormField name="slug" help="Apare în adresa paginii publice a locației.">
        <template #label>Identificator (slug)<span class="text-error">*</span></template>
        <UInput v-model="state.slug" placeholder="drumul-taberei" />
      </UFormField>
    </div>

    <UFormField name="street">
      <template #label>Stradă și număr<span class="text-error">*</span></template>
      <UInput v-model="state.street" placeholder="Strada Valea Oltului 73" />
    </UFormField>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <UFormField name="city">
        <template #label>Oraș<span class="text-error">*</span></template>
        <UInput v-model="state.city" placeholder="București" />
      </UFormField>
      <UFormField name="district" label="Sector sau județ">
        <UInput v-model="state.district" placeholder="Sector 6" />
      </UFormField>
      <UFormField name="postalCode" label="Cod poștal">
        <UInput v-model="state.postalCode" placeholder="061971" />
      </UFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UFormField
        name="latitude"
        help="Zecimale, ca în Google Maps. Folosite pe harta paginii publice."
      >
        <template #label>Latitudine<span class="text-error">*</span></template>
        <UInput v-model.number="state.latitude" type="number" step="0.000001" />
      </UFormField>
      <UFormField name="longitude">
        <template #label>Longitudine<span class="text-error">*</span></template>
        <UInput v-model.number="state.longitude" type="number" step="0.000001" />
      </UFormField>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <UFormField name="phone" label="Telefon" help="Lasă gol dacă se folosește numărul școlii.">
        <UInput v-model="state.phone" placeholder="+40732273347" />
      </UFormField>
      <UFormField name="email" label="E-mail">
        <UInput v-model="state.email" placeholder="office@itbridgeschool.com" />
      </UFormField>
    </div>

    <UFormField
      name="openingHours"
      label="Program"
      help="Doar dacă diferă de programul școlii. Gol înseamnă programul obișnuit."
    >
      <UInput v-model="state.openingHours" placeholder="Luni–vineri: 9:00–20:00" />
    </UFormField>

    <UFormField name="isActive" label="Stare">
      <select
        v-model="state.isActive"
        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
      >
        <option :value="true">Activă</option>
        <option :value="false">Inactivă</option>
      </select>
    </UFormField>

    <div class="flex gap-3 pt-6 border-t border-muted justify-center">
      <UButton type="submit" color="primary" variant="subtle" size="md" class="w-40">
        {{ submitLabel }}
      </UButton>
      <UButton color="primary" variant="outline" size="md" class="w-40" to="/admin/locations">
        Anulare
      </UButton>
    </div>
  </UForm>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { Location } from "~/types/location.types";

/**
 * Shared by the create and the edit page, so the two cannot validate differently — which is how
 * the group forms in this app ended up with three copies of the weekday list, two of them wrong.
 */
const props = defineProps<{
  initial?: Location | null;
  submitLabel: string;
}>();

const emit = defineEmits<{ submit: [payload: Record<string, unknown>] }>();

const schema = z.object({
  name: z.string().min(1, "Numele este obligatoriu").max(120),
  slug: z
    .string()
    .min(1, "Identificatorul este obligatoriu")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Doar litere mici, cifre și cratime simple"),
  street: z.string().min(1, "Adresa este obligatorie").max(255),
  city: z.string().min(1, "Orașul este obligatoriu").max(100),
  district: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number({ error: "Latitudinea este obligatorie" }).min(-90).max(90),
  longitude: z.number({ error: "Longitudinea este obligatorie" }).min(-180).max(180),
  phone: z.string().optional(),
  email: z.string().optional(),
  openingHours: z.string().max(255).optional(),
  isActive: z.boolean(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  name: props.initial?.name ?? "",
  slug: props.initial?.slug ?? "",
  street: props.initial?.street ?? "",
  city: props.initial?.city ?? "București",
  district: props.initial?.district ?? "",
  postalCode: props.initial?.postalCode ?? "",
  latitude: props.initial?.latitude,
  longitude: props.initial?.longitude,
  phone: props.initial?.phone ?? "",
  email: props.initial?.email ?? "",
  openingHours: props.initial?.openingHours ?? "",
  isActive: props.initial?.isActive ?? true,
});

/** `ă` and `ș` have to survive as `a` and `s`, or "Străulești" becomes "str-ule-ti". */
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ș/gi, "s")
    .replace(/ț/gi, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Only while the field is untouched, and never on an existing location: the slug is what the
// public URL is built from, so silently changing it on a rename would break every link to it.
const slugTouched = ref(Boolean(props.initial));
watch(
  () => state.name,
  (name) => {
    if (!slugTouched.value) state.slug = slugify(name ?? "");
  }
);
watch(
  () => state.slug,
  (slug) => {
    if (slug && slug !== slugify(state.name ?? "")) slugTouched.value = true;
  }
);

function onSubmit(event: FormSubmitEvent<Schema>) {
  const data = event.data;
  // Empty optional strings are dropped rather than sent: the API turns `''` into `undefined`
  // before validating, but sending nothing at all is what an "unset" field actually means.
  const optional = (value?: string) => (value && value.trim() !== "" ? value.trim() : undefined);

  emit("submit", {
    name: data.name,
    slug: data.slug,
    street: data.street,
    city: data.city,
    district: optional(data.district),
    postalCode: optional(data.postalCode),
    latitude: data.latitude,
    longitude: data.longitude,
    phone: optional(data.phone),
    email: optional(data.email),
    openingHours: optional(data.openingHours),
    isActive: data.isActive,
  });
}
</script>

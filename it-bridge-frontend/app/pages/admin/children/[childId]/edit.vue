<template>
  <UCard variant="subtle" class="max-w-2xl mx-auto">
    <template #header>
      <h1 class="text-2xl font-bold">Edit Child</h1>
    </template>

    <UForm :schema="schema" :state="state" class="space-y-5 w-full" @submit="handleSubmit">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField name="firstName">
          <template #label>First Name<span class="text-error">*</span></template>
          <UInput v-model="state.firstName" placeholder="e.g. John" />
        </UFormField>

        <UFormField name="lastName">
          <template #label>Last Name<span class="text-error">*</span></template>
          <UInput v-model="state.lastName" placeholder="e.g. Doe" />
        </UFormField>
      </div>

      <UFormField name="birthDate">
        <template #label>Birth Date</template>
        <UInputDate ref="inputDate" v-model="state.birthDate">
          <template #trailing>
            <UPopover :reference="inputDate?.inputsRef?.[3]?.$el">
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-calendar"
                aria-label="Select a date"
                class="px-0"
              />

              <template #content>
                <UCalendar v-model="state.birthDate" class="p-2" />
              </template>
            </UPopover>
          </template>
        </UInputDate>
      </UFormField>

      <div class="flex gap-3 pt-2">
        <UButton type="submit" size="lg" class="flex-1 justify-center" variant="solid"
          >Save Changes</UButton
        >
        <UButton
          type="button"
          variant="subtle"
          size="lg"
          class="flex-1 justify-center"
          @click="handleCancel"
          >Cancel</UButton
        >
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { Child } from "~/types/child.types";
import { useChildrenStore } from "~/stores/childrenStore";
import { parseDate } from "@internationalized/date";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useNotifications } from "~/composables/useNotifications";
import { normalizeName } from "~/composables/useUtils";

const route = useRoute();
const inputDate = ref();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();

const { success } = useNotifications();

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Edit Child",
});

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  birthDate: z.any().optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<{
  id: string;
  firstName: string;
  lastName: string;
  birthDate?: any;
  createdAt: string;
}>({
  id: "",
  firstName: "",
  lastName: "",
  birthDate: undefined,
  createdAt: "",
});

onMounted(async () => {
  await childrenApi.fetchChildren();
  const childId = route.params.childId;
  const child: Child | undefined = childrenStore.getChildById(childId as string);
  if (child) {
    state.id = child.id;
    state.firstName = child.firstName;
    state.lastName = child.lastName;
    state.birthDate = parseDate(child.birthDate);
    state.createdAt = child.createdAt;
  }
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  const childId = route.params.childId as string;
  // Prepare payload without createdAt (cannot be edited)
  const birthDate = event.data.birthDate;
  const formattedDate =
    birthDate instanceof Date ? birthDate.toISOString().split("T")[0] : birthDate?.toString?.();

  const payload = {
    firstName: normalizeName(event.data.firstName),
    lastName: normalizeName(event.data.lastName),
    birthDate: formattedDate,
  };

  await childrenApi.updateChild(childId, payload);
  success("Child updated successfully");

  await navigateTo("/admin/children");
}

function handleCancel() {
  navigateTo("/admin/children");
}
</script>

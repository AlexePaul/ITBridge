<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">User Profiles</h1>
        <p class="text-muted mt-1">Manage and view all user profiles</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="navigateTo('/admin/profiles/new')"
      >
        <UIcon name="i-lucide-user-plus" class="mr-2" />
        Add New Profile
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="h-11 flex items-center px-4">
        {{ filteredProfiles.length }} total
      </UBadge>
    </div>

    <!-- Filters Card -->
    <UCard class="border">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UInput
          v-model="filters.search"
          placeholder="Search by name..."
          icon="i-lucide-search"
          color="primary"
        >
          <template #trailing>
            <UButton
              v-if="filters.search"
              color="neutral"
              variant="link"
              icon="i-lucide-x"
              :padded="false"
              @click="filters.search = ''"
            />
          </template>
        </UInput>

        <UInput
          v-model="filters.email"
          placeholder="Filter by email..."
          icon="i-lucide-mail"
          color="primary"
        >
          <template #trailing>
            <UButton
              v-if="filters.email"
              color="neutral"
              variant="link"
              icon="i-lucide-x"
              :padded="false"
              @click="filters.email = ''"
            />
          </template>
        </UInput>

        <UInput
          v-model="filters.phone"
          placeholder="Filter by phone..."
          icon="i-lucide-phone"
          color="primary"
        >
          <template #trailing>
            <UButton
              v-if="filters.phone"
              color="neutral"
              variant="link"
              icon="i-lucide-x"
              :padded="false"
              @click="filters.phone = ''"
            />
          </template>
        </UInput>
      </div>

      <div class="flex justify-between items-center mt-4 pt-4 border-t">
        <div class="text-sm text-muted">
          Showing {{ filteredProfiles.length }} of {{ profiles.length }} profiles
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          @click="clearFilters"
          :disabled="!hasActiveFilters"
        >
          Clear Filters
        </UButton>
      </div>
    </UCard>

    <!-- Table Card -->
    <UCard class="border">
      <UTable ref="table" :data="filteredProfiles" :columns="columns" class="w-full" />
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";
import { computed } from "vue";

const profileApi = useProfileApi();
const UBadge = resolveComponent("UBadge");
const UIcon = resolveComponent("UIcon");
const UDropdownMenu = resolveComponent("UDropdownMenu");
const UButton = resolveComponent("UButton");

const profiles: Ref<Profile[]> = ref([]);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "User Profiles",
});

// Filters
const filters = ref({
  search: "",
  email: "",
  phone: "",
});

const hasActiveFilters = computed(() => {
  return !!(filters.value.search || filters.value.email || filters.value.phone);
});

const filteredProfiles = computed(() => {
  let result = [...profiles.value];

  // Search filter (name)
  if (filters.value.search) {
    const search = filters.value.search.toLowerCase();
    result = result.filter(
      (p) =>
        p.firstName?.toLowerCase().includes(search) || p.lastName?.toLowerCase().includes(search)
    );
  }

  // Email filter
  if (filters.value.email) {
    const email = filters.value.email.toLowerCase();
    result = result.filter((p) => p.email?.toLowerCase().includes(email));
  }

  // Phone filter
  if (filters.value.phone) {
    const phone = filters.value.phone;
    result = result.filter((p) => p.phone?.includes(phone));
  }

  return result;
});

const clearFilters = () => {
  filters.value.search = "";
  filters.value.email = "";
  filters.value.phone = "";
};

onMounted(async () => {
  profiles.value = await profileApi.fetchProfile();
});

const columns: TableColumn<Profile>[] = [
  {
    accessorKey: "id",
    header: "#",
    cell: ({ row }) =>
      h(
        UBadge,
        { class: "capitalize", variant: "subtle", color: "primary" },
        () => `#${row.getValue("id")}`
      ),
  },
  {
    accessorKey: "hasUser",
    header: "Has User",
    cell: ({ row }) => {
      const color = {
        true: "success" as const,
        false: "error" as const,
      }[row.getValue("hasUser") as string];

      return h(UBadge, { class: "capitalize", variant: "subtle", color }, () =>
        row.getValue("hasUser") ? "True" : "False"
      );
    },
  },
  {
    id: "name",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-user", class: "text-secondary" }),
        h("span", "Name"),
      ]),
    cell: ({ row }) => {
      const firstName = row.original.firstName || "";
      const lastName = row.original.lastName || "";
      return `${firstName} ${lastName}`.trim() || h("span", { class: "text-muted" }, "N/A");
    },
  },
  {
    accessorKey: "email",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-mail", class: "text-secondary" }),
        h("span", "Email"),
      ]),
  },
  {
    accessorKey: "phone",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-phone", class: "text-secondary" }),
        h("span", "Phone"),
      ]),
  },
  {
    accessorKey: "address",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-map-pin", class: "text-secondary" }),
        h("span", "Address"),
      ]),
    cell: ({ row }) => row.getValue("address") || h("span", { class: "text-muted" }, "N/A"),
  },
  {
    accessorKey: "children",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-baby", class: "text-secondary" }),
        h("span", "Children"),
      ]),
    cell: ({ row }) =>
      h(
        UBadge,
        { color: "secondary", variant: "subtle" },
        () => `${row.original.children?.length ?? 0}`
      ),
  },
  {
    id: "actions",
    enableHiding: false,
    meta: {
      class: {
        td: "text-right",
      },
    },
    cell: ({ row }) => {
      const items = [
        {
          type: "label",
          label: "Actions",
        },
        {
          type: "link",
          label: "View Profile",
          icon: "i-lucide-eye",
          to: `/admin/profiles/${row.original.id}`,
        },
        {
          type: "link",
          label: "Add Children",
          icon: "i-lucide-plus",
          to: `/admin/profiles/${row.original.id}/children/new`,
        },
        {
          type: "link",
          label: "Edit Profile",
          icon: "i-lucide-edit",
          to: `/admin/profiles/${row.original.id}/edit`,
        },
      ];

      return h(
        UDropdownMenu,
        {
          content: {
            align: "end",
          },
          items,
          "aria-label": "Actions dropdown",
        },
        () =>
          h(UButton, {
            icon: "i-lucide-ellipsis-vertical",
            color: "neutral",
            variant: "ghost",
            "aria-label": "Actions dropdown",
          })
      );
    },
  },
];
</script>

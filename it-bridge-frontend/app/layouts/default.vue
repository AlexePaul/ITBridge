<template>
	<div class="min-h-screen flex flex-col">
		<Navbar/>
		<UMain>
			<slot />
		</UMain>
		<AppFooter/>
	</div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/01-auth.client";
import { overdueInvoices, pendingInvoices } from "~/plugins/02-payments.client";

const userStore = useUserStore();

</script>

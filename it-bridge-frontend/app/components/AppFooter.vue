<template>
  <footer class="py-12 px-6 border-t">
    <div class="max-w-6xl mx-auto">
      <div class="grid md:grid-cols-3 gap-8">
        <div>
          <h3 class="font-bold text-highlighted mb-4">IT Bridge School</h3>
          <p class="text-sm text-muted">
            Academia de IT pentru copii în București. Transformăm procesul de învățare într-o
            aventură captivantă!
          </p>
        </div>
        <div>
          <h3 class="font-bold text-highlighted mb-4">Informații utile</h3>
          <ul class="space-y-2 text-sm">
            <li>
              <NuxtLink to="/about" class="text-muted hover:text-default transition"
                >Despre noi</NuxtLink
              >
            </li>
            <li>
              <NuxtLink to="/courses" class="text-muted hover:text-default transition"
                >Cursuri & Înscrieri</NuxtLink
              >
            </li>
            <li>
              <NuxtLink to="/contact" class="text-muted hover:text-default transition"
                >Contact</NuxtLink
              >
            </li>
          </ul>
        </div>
        <div>
          <h3 class="font-bold text-highlighted mb-4">Urmărește-ne</h3>
          <div class="flex gap-3">
            <UButton
              icon="i-lucide-instagram"
              variant="ghost"
              color="neutral"
              size="lg"
              to="https://www.instagram.com/itbridgeschool"
              target="_blank"
            />
            <UButton
              icon="i-lucide-facebook"
              variant="ghost"
              color="neutral"
              size="lg"
              to="https://www.facebook.com/share/19z5TxEu7F/"
              target="_blank"
            />
          </div>
        </div>
      </div>
      <USeparator class="my-8" />
      <p class="text-center text-sm text-muted">
        © {{ new Date().getFullYear() }} IT Bridge School. Toate drepturile rezervate.
      </p>
    </div>
  </footer>
</template>
<script setup lang="ts">
//
</script>

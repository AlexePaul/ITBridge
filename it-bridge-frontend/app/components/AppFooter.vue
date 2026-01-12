<template>
  <footer class="py-12 px-6 border-t border-neutral">
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
              variant="ghost"
              color="neutral"
              size="lg"
              to="https://www.instagram.com/itbridgeschool"
              target="_blank"
            >
              <span class="w-6 h-6 inline-flex items-center justify-center text-black dark:text-white" aria-hidden="true" v-html="instagramSvgProcessed"></span>
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="lg"
              to="https://www.facebook.com/share/19z5TxEu7F/"
              target="_blank"
            >
              <span class="w-6 h-6 inline-flex items-center justify-center text-black dark:text-white" aria-hidden="true" v-html="facebookSvgProcessed"></span>
            </UButton>
            <UButton
              variant="ghost"
              color="neutral"
              size="lg"
              to="https://www.tiktok.com/@itbridgeschool"
              target="_blank"
              class="p-0"
            >
              <span class="w-6 h-6 inline-flex items-center justify-center text-black dark:text-white" aria-hidden="true" v-html="tiktokSvgProcessed"></span>
            </UButton>
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
import tiktokSvg from '~/assets/icons/tiktok.svg?raw'
import facebookSvg from '~/assets/icons/facebook.svg?raw'
import instagramSvg from '~/assets/icons/instagram.svg?raw'

// Inject fill=currentColor and make the svg scale to the wrapper
const svgWithCurrentColor = (svg: string) =>
  svg.replace(
    '<svg',
    '<svg fill="currentColor" width="100%" height="100%" style="width:100%;height:100%;display:block"'
  )

const tiktokSvgProcessed = svgWithCurrentColor(tiktokSvg)
const instagramSvgProcessed = svgWithCurrentColor(instagramSvg)
const facebookSvgProcessed = svgWithCurrentColor(facebookSvg)
</script>
<!-- styling moved to Tailwind utilities on the elements -->

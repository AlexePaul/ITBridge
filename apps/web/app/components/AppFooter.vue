<template>
  <footer>
    <hr class="rule" />
    <div class="page section">
      <div class="footer-grid">
        <div>
          <p class="footer-title">IT Bridge School</p>
          <p class="footer-note">
            Școală de informatică pentru copii, cu două locații în București. De la primii pași pe
            calculator până la pregătirea pentru Bacalaureat și olimpiade.
          </p>
        </div>
        <div>
          <p class="kicker">Pagini</p>
          <div class="footer-links">
            <NuxtLink to="/about" class="footer-link">Despre noi</NuxtLink>
            <NuxtLink to="/courses" class="footer-link">Cursuri și înscrieri</NuxtLink>
            <NuxtLink to="/contact" class="footer-link">Contact</NuxtLink>
          </div>
        </div>
        <div>
          <p class="kicker">Urmărește-ne</p>
          <div class="stack-row">
            <a
              v-for="network in socialNetworks"
              :key="network.label"
              :href="network.url"
              class="social"
              target="_blank"
              rel="noopener"
              :aria-label="network.label"
            >
              <span aria-hidden="true" v-html="network.icon"></span>
            </a>
          </div>
        </div>
      </div>
      <hr class="rule rule-loose" />
      <p class="colophon tnum">
        © {{ new Date().getFullYear() }} IT Bridge School. Toate drepturile rezervate. &nbsp;·&nbsp;
        {{ locationLine }}
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import tiktokSvg from "~/assets/icons/tiktok.svg?raw";
import facebookSvg from "~/assets/icons/facebook.svg?raw";
import instagramSvg from "~/assets/icons/instagram.svg?raw";
import { SCHOOL_LOCATIONS, SCHOOL_SOCIAL } from "~/constants/school";

// Inject fill=currentColor and make the svg scale to the wrapper
const svgWithCurrentColor = (svg: string) =>
  svg.replace(
    "<svg",
    '<svg fill="currentColor" width="100%" height="100%" style="width:100%;height:100%;display:block"'
  );

const socialNetworks = [
  { label: "Instagram", url: SCHOOL_SOCIAL.instagram, icon: svgWithCurrentColor(instagramSvg) },
  { label: "Facebook", url: SCHOOL_SOCIAL.facebook, icon: svgWithCurrentColor(facebookSvg) },
  { label: "TikTok", url: SCHOOL_SOCIAL.tiktok, icon: svgWithCurrentColor(tiktokSvg) },
];

const locationLine = computed(() =>
  SCHOOL_LOCATIONS.map((location) => location.address).join(" · ")
);
</script>

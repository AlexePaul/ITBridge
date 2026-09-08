<template>
  <div class="map-plate">
    <!--
      `is-revealed` is load-bearing, not decoration. `useReveal` puts `reveal-on` on <html>, and
      that stylesheet clips every `.plate` to nothing until the observer marks it revealed — but
      the observer took its census at mount, and this plate does not exist until the reader
      presses. Without the class it stays at `clip-path: inset(0 0 100% 0)` for good: the request
      goes to Google and the reader is shown an empty box. With it, the plate wipes in like every
      other one on the site.
    -->
    <div v-if="consent.has('map')" class="plate is-revealed">
      <iframe
        :src="location.mapEmbedUrl"
        :title="`Hartă: ${SCHOOL_NAME} ${location.neighbourhood}`"
        width="100%"
        height="320"
        style="border: 0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
    <div v-else class="card card-lg map-gate">
      <h3 class="sub-title">Harta</h3>
      <p class="body-text">
        {{ location.street }}, {{ location.district }}. Harta e încărcată de la Google, iar când o
        ceri, Google află adresa ta IP și poate pune cookie-uri ale lui. Până apeși, nu pleacă nimic
        de aici.
      </p>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="consent.grant('map')">
          Încarcă harta
        </button>
        <a :href="location.mapLink" class="btn btn-ghost" target="_blank" rel="noopener">
          Deschide în Google Maps
        </a>
      </div>
      <p class="note">
        Ce pune Google și cât ține scrie în
        <NuxtLink to="/cookies" class="link">politica de cookie-uri</NuxtLink>. Alegerea ține cât
        stai pe site; la o vizită nouă întrebăm din nou.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SCHOOL_NAME, type SchoolLocation } from "#shared/school";

/**
 * The map on a location page, behind the reader's own press (E07 S5).
 *
 * The iframe used to sit inline on both pages with `loading="lazy"`, which reads as restraint and
 * is not: it fires when the reader scrolls near it, so Google learned the visitor's IP from a page
 * nobody had agreed to anything on. The gate is `v-if`, not `v-show` or a swapped `src` — the
 * element has to be absent from the DOM, because a hidden iframe with a `src` is a request that
 * already left.
 *
 * The address and the link to Google Maps stay visible in the placeholder on purpose. A reader who
 * would rather not be counted by Google still needs to find the building, and following the link
 * is their decision made in the open, in another tab.
 *
 * Both pages render this rather than a copy each: the two blocks were identical, and the one that
 * would have kept the eager iframe is whichever a later edit forgot.
 */
defineProps<{ location: SchoolLocation }>();

const consent = useConsentStore();
</script>

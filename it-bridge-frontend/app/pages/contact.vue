<template>
  <div>
    <!-- Header -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h1 class="text-4xl font-bold mb-4 text-secondary">Contactează-ne</h1>
          <p class="text-lg text-muted">
            Suntem aici ca să te ajutăm! Ai întrebări? Scrie-ne și te vom contacta cât mai curând.
          </p>
        </div>
      </UCard>
    </section>

    <!-- Contact Content -->
    <section class="py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-3xl font-bold text-highlighted mb-8">Informații de Contact</h2>

        <div class="space-y-8">
          <UCard v-for="info in contactInfo" :key="info.title" color="neutral" variant="soft">
            <template #header>
              <div class="flex items-center gap-3">
                <UIcon :name="info.icon" class="text-secondary w-6 h-6" />
                <h3 class="font-semibold text-lg text-highlighted">{{ info.title }}</h3>
              </div>
            </template>
            <div v-html="info.content"></div>
          </UCard>

          <!-- Location Card with Map -->
          <UCard color="neutral" variant="soft">
            <template #header>
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-map-pin" class="text-secondary w-6 h-6" />
                <h3 class="font-semibold text-lg text-highlighted">Locație</h3>
              </div>
            </template>
            <p class="text-muted mb-4">
              Strada Valea Oltului 73<br />
              București, România
            </p>
            <div class="relative overflow-hidden rounded-lg">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d5699.683885857019!2d26.013984!3d44.415889!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40b20041575f3945%3A0xfb045a6b8c5a127!2sStrada%20Valea%20Oltului%2073%2C%20Bucure%C8%99ti%2C%20Romania!5e0!3m2!1sen!2sus!4v1768175036715!5m2!1sen!2sus"
                width="100%"
                height="300"
                style="border: 0"
                allowfullscreen=""
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                class="dark:invert dark:hue-rotate-180"
              ></iframe>
            </div>
          </UCard>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "default" as any,
  title: "Contact - IT Bridge School",
});

const contactInfo = [
  {
    icon: "i-lucide-phone",
    title: "Telefon",
    content: `
      <a href="tel:+40732273347" class="text-primary font-semibold hover:underline">
        +40 732 273 347
      </a>
      <p class="text-sm text-muted mt-2">Disponibil luni-vineri 9:00-18:00</p>
    `,
  },
  {
    icon: "i-lucide-mail",
    title: "Email",
    content: `
      <a href="mailto:alexepaul2011@gmail.com" class="text-primary font-semibold hover:underline">
        alexepaul2011@gmail.com
      </a>
      <p class="text-sm text-muted mt-2">Vă vom răspunde în cel mult 24 de ore</p>
    `,
  },
  {
    icon: "i-lucide-clock",
    title: "Program",
    content: `
      <div class="space-y-2 text-muted text-sm">
        <p><span class="font-semibold">Luni - Vineri:</span> 9:00 - 18:00</p>
        <p><span class="font-semibold">Sâmbătă:</span> 10:00 - 14:00</p>
        <p><span class="font-semibold">Duminică:</span> Închis</p>
      </div>
    `,
  },
];

const socialLinks = [
  {
    platform: "Instagram",
    icon: "i-lucide-instagram",
    url: "https://www.instagram.com/itbridgeschool",
  },
  {
    platform: "Facebook",
    icon: "i-lucide-facebook",
    url: "https://www.facebook.com/share/19z5TxEu7F/",
  },
  {
    platform: "TikTok",
    icon: "i-lucide-music",
    url: "https://www.tiktok.com/@itbridgeschool",
  },
];

const subjectOptions = [
  { value: "course_inquiry", label: "Întrebare despre Cursuri" },
  { value: "enrollment", label: "Înregistrare" },
  { value: "partnership", label: "Parteneriat" },
  { value: "feedback", label: "Feedback" },
  { value: "other", label: "Altele" },
];
</script>

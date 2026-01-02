<template>
  <div>
    <!-- Hero Section -->
    <section class="py-24 px-6 text-center">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-4xl md:text-5xl font-bold text-highlighted mb-4">
          Academia de IT pentru copii
        </h1>
        <p class="text-xl md:text-2xl text-secondary font-semibold mb-6">
          Învață, Crește, Reușește!
        </p>
        <p class="text-lg text-muted mb-8 max-w-2xl mx-auto">
          Transformăm procesul de învățare într-o aventură captivantă! Copiii descoperă lumea
          IT-ului prin activități interactive, jocuri educative și proiecte practice.
        </p>
        <div class="flex flex-wrap gap-4 justify-center">
          <UButton
            size="xl"
            color="primary"
            variant="solid"
            label="Cursuri & Înscrieri"
            icon="i-lucide-book-open"
          />
          <UButton
            size="xl"
            color="neutral"
            variant="outline"
            label="Contactează-ne"
            icon="i-lucide-phone"
          />
        </div>
      </div>
    </section>

    <!-- Image Carousel -->
    <section class="py-16">
      <UCard class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center text-highlighted mb-8">Momentele Noastre</h2>
          <UCarousel
            :items="carouselItems"
            arrows
            :prev-icon="prevIcon"
            :next-icon="nextIcon"
            :ui="{ item: 'basis-full md:basis-1/2 lg:basis-1/3' }"
          >
            <template #default="{ item }">
              <UCard
                color="primary"
                class="h-48 flex items-center justify-center border border-neutral-100"
              >
                <div class="text-center text-muted">
                  <UIcon name="i-lucide-image" class="text-5xl mb-2" />
                  <p>{{ item.title }}</p>
                </div>
              </UCard>
            </template>
          </UCarousel>
        </div>
      </UCard>
    </section>

    <!-- Advantages Section -->
    <section class="py-16 px-6">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-3xl font-bold text-center text-highlighted mb-4">
          Avantajele Cursurilor Noastre
        </h2>
        <p class="text-center text-muted mb-12 max-w-2xl mx-auto">
          Înscrierea copilului tău la cursurile noastre de IT vine cu multiple beneficii care îi vor
          dezvolta abilitățile tehnice.
        </p>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <UCard
            v-for="advantage in advantages"
            :key="advantage.title"
            color="neutral"
            variant="soft"
          >
            <div class="text-center">
              <UIcon :name="advantage.icon" class="text-4xl text-secondary mb-4" />
              <h3 class="font-semibold text-lg text-highlighted mb-2">
                {{ advantage.title }}
              </h3>
              <p class="text-muted text-sm">
                {{ advantage.description }}
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-16">
      <UCard color="neutral" class="py-8" variant="soft">
        <div class="max-w-6xl mx-auto">
          <div class="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 class="text-3xl font-bold text-highlighted mb-6">
                Alegerea cursurilor noastre reprezintă un pas important
              </h2>
              <p class="text-muted mb-6">
                Dezvoltă competențele necesare pentru viitorul digital al copilului tău. Cursurile
                sunt structurate astfel încât copiii să dezvolte capacitatea de gândire și viziune
                în elaborarea și planificarea sarcinilor.
              </p>
              <ul class="space-y-3">
                <li v-for="feature in features" :key="feature" class="flex items-center gap-3">
                  <UIcon name="i-lucide-check-circle" class="text-xl text-secondary" />
                  <span class="text-muted">{{ feature }}</span>
                </li>
              </ul>
            </div>
            <UCard color="neutral" class="border-0 rounded-xl" variant="outline">
              <div class="h-64 flex items-center justify-center text-muted">
                <div class="text-center">
                  <UIcon name="i-lucide-image" class="text-6xl mb-2" />
                  <p>Placeholder pentru imagine</p>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UCard>
    </section>

    <!-- CTA Section -->
    <section class="py-16 px-6">
      <div class="max-w-4xl mx-auto">
        <UCard color="neutral" class="text-center p-8" variant="soft">
          <h2 class="text-3xl font-bold text-highlighted mb-4">Suntem aici să te ajutăm!</h2>
          <p class="text-muted mb-8 text-lg">
            Ai întrebări sau dorești mai multe detalii? Contactează-ne acum și hai să găsim soluția
            potrivită pentru tine!
          </p>
          <div class="flex flex-wrap gap-4 justify-center">
            <UButton
              size="xl"
              color="primary"
              variant="solid"
              label="Contact"
              icon="i-lucide-mail"
            />
            <UButton
              size="xl"
              color="neutral"
              variant="outline"
              label="0773.896.129"
              icon="i-lucide-phone"
            />
          </div>
        </UCard>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/userStore";
import { ref } from "vue";

definePageMeta({
  layout: "default" as any,
  middleware: "auth" as any,
});

defineProps<{
  prevIcon?: string;
  nextIcon?: string;
}>();

const userStore = useUserStore();

const setLayout = () => {
  if (userStore.user?.role === "ADMIN") {
    setPageLayout("default" as any);
  } else {
    setPageLayout("default" as any);
  }
};

onMounted(() => {
  setLayout();
});

watch(
  () => userStore.user,
  () => {
    setLayout();
  }
);

const carouselItems = [
  { title: "Activități practice" },
  { title: "Proiecte creative" },
  { title: "Lecții interactive" },
  { title: "Momente de succes" },
  { title: "Echipa noastră" },
];

const advantages = [
  {
    icon: "i-lucide-laptop",
    title: "Competențe Digitale Esențiale",
    description:
      "Copilul va învăța să folosească aplicații și instrumente tehnologice moderne, fundamentale pentru succesul academic.",
  },
  {
    icon: "i-lucide-code",
    title: "Abilități de Programare",
    description:
      "Elevii își vor dezvolta abilități de programare, învățând limbaje populare precum Python, Java și C++.",
  },
  {
    icon: "i-lucide-brain",
    title: "Gândire Logică",
    description:
      "Exercițiile și proiectele practice îi vor ajuta pe copii să își dezvolte gândirea critică și abilitățile de soluționare.",
  },
  {
    icon: "i-lucide-lightbulb",
    title: "Creativitate și Inovație",
    description:
      "Cu ajutorul instrumentelor precum Scratch, Tinkercad și Canva, copiii vor explora latura creativă a tehnologiei.",
  },
  {
    icon: "i-lucide-rocket",
    title: "Adaptare la Noile Tehnologii",
    description:
      "Cursurile noastre îi vor pregăti pe copii să se adapteze rapid la noile tehnologii din domeniul IT.",
  },
  {
    icon: "i-lucide-book-open",
    title: "Acces la Resurse și Suport",
    description:
      "Elevii beneficiază de acces la materiale educaționale actualizate și suport constant din partea profesorilor.",
  },
];

const features = [
  "Durata fiecărui modul: 32 săptămâni",
  "Sesiuni de 1.5 ore",
  "Grupe mici pentru atenție personalizată",
  "Proiecte practice și aplicabile",
  "Mediu relaxat și prietenos",
];
</script>

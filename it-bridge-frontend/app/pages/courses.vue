<template>
  <div>
    <!-- Classes Grid -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold mb-12 text-center text-secondary">Clasele Noastre</h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <UCard
              v-for="course in courses"
              :key="course.title"
              class="hover:shadow-lg transition-shadow"
              color="neutral"
              variant="soft"
            >
              <template #header>
                <div>
                  <h3 class="text-xl font-bold text-highlighted">{{ course.title }}</h3>
                  <p class="text-sm text-secondary">{{ course.level }}</p>
                </div>
              </template>
              <div class="h-60 overflow-y-auto mb-4">
                <p class="text-sm font-semibold mb-2">Teme Acoperite:</p>
                <ul class="text-sm text-muted space-y-1">
                  <li v-for="topic in course.topics" :key="topic">• {{ topic }}</li>
                </ul>
              </div>
              <template #footer>
                <UButton block color="primary" to="/contact">Cere Informații</UButton>
              </template>
            </UCard>
          </div>
        </div>
      </UCard>
    </section>

    <!-- Enrollment Info -->
    <section class="py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <h2 class="text-3xl font-bold mb-8 text-center text-highlighted">Cum Funcționează?</h2>
        <div class="grid md:grid-cols-2 gap-8">
          <div>
            <h3 class="text-xl font-semibold mb-4 text-highlighted">Procesul de Înregistrare</h3>
            <ol class="space-y-3 text-muted">
              <li v-for="(step, index) in enrollmentSteps" :key="index" class="flex gap-3">
                <span class="font-bold text-primary">{{ index + 1 }}.</span>
                <span>{{ step }}</span>
              </li>
            </ol>
          </div>
          <div>
            <h3 class="text-xl font-semibold mb-4 text-highlighted">De Ce Noi?</h3>
            <ul class="space-y-3 text-muted">
              <li v-for="benefit in benefits" :key="benefit" class="flex gap-2">
                <UIcon name="i-lucide-check" class="text-primary w-5 h-5 shrink-0 mt-0.5" />
                <span>{{ benefit }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl font-bold mb-6 text-highlighted">Gata să Pornim?</h2>
          <p class="text-lg text-muted mb-8">
            Contactează-ne astazi și descoperă cum îți putem ajuta să reușești la informatică.
          </p>
          <UButton size="lg" to="/contact">
            <UIcon name="i-lucide-phone" class="mr-2" />
            Cere Informații
          </UButton>
        </div>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "default" as any,
  title: "Meditații Informatică - IT Bridge School",
});

const features = [
  {
    icon: "i-lucide-users-2",
    title: "Meditații Interactive",
    description: "Sesiuni pentru o învățare interactivă și suport mutual între colegi.",
  },
  {
    icon: "i-lucide-book",
    title: "Pregătire Examene",
    description:
      "Pregătire specifică pentru examene școlare și teste de evaluare. Cunoaștere a cerințelor și strategiilor de succes.",
  },
  {
    icon: "i-lucide-target",
    title: "Rezultate Garantate",
    description:
      "Rezultate demonstrabile cu progres măsurabil. Fiecare elev primește atenție dedicată.",
  },
];

const courses = [
  {
    title: "Clasa 0-2",
    level: "Inițiere",
    topics: [
      "Cunoașterea calculatorului",
      "Folosirea mouse-ului și tastaturii",
      "Jocuri educative pe calculator",
      "Introducere în concepte de bază",
      "Creativitate prin desen digital 2D și 3D",
    ],
  },
  {
    title: "Clasa 3-4",
    level: "Începători",
    topics: [
      "Noțiuni de bază în informatică",
      "Folosirea sistemelor de operare",
      "Aplicații Office (Word, PowerPoint, Excel)",
      "Internet și siguranță online",
      "Jocuri educative și programare simplă in Scratch",
    ],
  },
  {
    title: "Clasa 5-6",
    level: "Intermediar",
    topics: [
      "Introducere în algoritmi",
      "Programare în Scratch",
      "Proiecte practice",
      "Dezvoltarea Site-urilor web simple",
    ],
  },
  {
    title: "Clasa 7-8",
    level: "Intermediar-Avansat",
    topics: [
      "Programare în Python",
      "Algoritmi și instrucțiuni de bază",
      "Proiecte practice",
      "Dezvoltarea Site-urilor web (HTML, CSS, JavaScript)",
      "Introducere în baze de date",
      "Pregătire pentru olimpiade școlare",
    ],
  },
  {
    title: "Clasa 9-12",
    level: "Avansat",
    topics: [
      "Algoritmi și complexitate",
      "Programare în C/C++",
      "Structuri de date avansate",
      "Probleme de concurs",
      "Pregătire BAC informatică",
      "Baze de date (SQL)",
      "Programe complexe",
      "Pregătire pentru olimpiadă",
    ],
  },
  {
    title: "Pregătire Bacalaureat",
    level: "Avansat",
    topics: [
      "Prepararea pentru examenele de Bacalaureat",
      "Algoritmi de concurs",
      "Probleme tip pentru Bacalaureat",
      "Timp și strategie de examen",
      "Feedback și corecții",
    ],
  },
];

const enrollmentSteps = [
  "Contactează-ne pentru a discuta nevoile tale",
  "Te evaluăm pentru a determina nivelul potrivit",
  "Alegi clasa potrivită pentru tine",
  "Stabilim orar și program de meditații",
  "Pornim cu primele meditații",
];

const benefits = [
  "Instructori experimentați și dedicați",
  "Programe structurate și atenție personalizată",
  "Rezultate demonstrabile",
  "Materiale și resurse de calitate",
  "Flexibilitate în orar",
];
</script>

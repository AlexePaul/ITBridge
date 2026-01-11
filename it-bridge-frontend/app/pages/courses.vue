<template>
  <div>
    <!-- Header -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h1 class="text-4xl font-bold mb-4 text-highlighted">Meditații Informatică</h1>
          <p class="text-lg text-muted">
            Centre de pregătire și tutoring pentru informatică. Ajutăm elevii să înțeleagă
            conceptele IT și să obțină rezultate excelente la examene.
          </p>
        </div>
      </UCard>
    </section>

    <!-- About Section -->
    <section class="py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto mb-16">
        <h2 class="text-3xl font-bold mb-6 text-highlighted">Ce Oferim?</h2>
        <p class="text-muted mb-8">
          Oferim lecții personalizate pentru elevi de toate vârstele și nivelurile, de la începători
          la avansați. Fiecare curs este conceput pentru a se potrivi nevoilor individuale ale
          elevilor noștri, asigurându-ne că aceștia înțeleg conceptele cheie și dobândesc
          abilitățile necesare pentru a excela în domeniul IT.
        </p>
        <div class="grid md:grid-cols-3 gap-6">
          <UCard v-for="feature in features" :key="feature.title" color="neutral" variant="soft">
            <template #header>
              <div class="flex items-center gap-3">
                <UIcon :name="feature.icon" class="text-secondary w-6 h-6" />
                <h3 class="font-semibold text-highlighted">{{ feature.title }}</h3>
              </div>
            </template>
            <p class="text-muted text-sm">{{ feature.description }}</p>
          </UCard>
        </div>
      </div>
    </section>

    <!-- Classes Grid -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold mb-12 text-center text-highlighted">Clasele Noastre</h2>
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
                  <p class="text-sm text-muted">{{ course.level }}</p>
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
                <UIcon name="i-lucide-check" class="text-primary w-5 h-5 flex-shrink-0 mt-0.5" />
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
    title: "Clasa 0-4",
    level: "Inițiere",
    topics: [
      "Cunoașterea calculatorului",
      "Folosirea mouse-ului și tastaturii",
      "Jocuri educative pe calculator",
      "Introducere în concepte de bază",
      "Creativitate prin desen digital",
    ],
  },
  {
    title: "Clasa 5-6",
    level: "Începători",
    topics: [
      "Noțiuni de bază în informatică",
      "Componentele calculatorului",
      "Sisteme de operare",
      "Aplicații Office (Word, Excel)",
      "Internet și siguranță online",
    ],
  },
  {
    title: "Clasa 7-8",
    level: "Intermediar",
    topics: [
      "Introducere în algoritmi",
      "Pseudocod și fluxograme",
      "Programare în Scratch",
      "Structuri de date elementare",
      "Proiecte practice",
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
    level: "Facultăți IT",
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

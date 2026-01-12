<template>
  <div>
    <!-- Header -->
    <section class="py-16">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-6xl mx-auto">
          <h1 class="text-4xl font-bold mb-4 text-secondary">Despre Noi</h1>
          <p class="text-lg text-muted">Transformăm copiii în creatori de tehnologie</p>
        </div>
      </UCard>
    </section>

    <!-- Main Content -->
    <section class="py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto space-y-12">
        <!-- About Section 1 -->
        <div class="flex gap-8 items-center">
          <div>
            <h2 class="text-3xl font-bold mb-6">Cine Suntem?</h2>
            <p class="text-muted mb-4">
              IT Bridge School este o academie de IT dedicată copiilor din București. Suntem
              pasionați de educație și de tehnologie, și credem că fiecare copil merită o șansă de
              a-și atinge potențialul în domeniul IT.
            </p>
            <p class="text-muted mb-4">
              Fondată cu scopul de a oferi educație de calitate în domeniu informaticii, academia
              noastră a ajutat sute de copii să descopere pasiunea lor pentru tehnologie și să
              dezvolte abilități care îi vor ajuta în viitoarele lor cariere.
            </p>
            <p class="text-muted">
              Metodologia noastră de predare este bazată pe experiență practică, proiecte reale și o
              abordare interactivă care face ca învățarea să fie divertisantă și eficientă.
            </p>
          </div>
        </div>
        <h2 class="text-secondary text-center text-2xl font-semibold">Echipa Noastră</h2>
        <!-- About Section 2 -->
        <div class="grid md:grid-cols-2 gap-8 items-center">
          <div class="rounded-lg h-150 order-2 md:order-1">
            <img
              src="/images/Paul.jpeg"
              alt="Profesorii IT Bridge School"
              class="w-full h-full object-cover rounded-lg"
            />
          </div>
          <div class="order-1 md:order-2">
            <h2 class="text-3xl font-bold mb-6">Alexe Vasile Paul</h2>
            <p class="text-muted mb-4">
              Numele meu este Paul și sunt profesor la IT Bridge School. Sunt pasionat de tehnologie
              și de educație. Am termiant studiile de licență în Informatică la Universitatea din
              București, avand lucrarea de licenta bazata pe modalitati de folosire a tehnologiei
              pentru a îmbunătăți procesul educațional.
            </p>
            <p class="text-muted mb-4">Uite cateva din reușitele mele profesionale:</p>
            <ul>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Am promovat examenul de Bacalaureat cu nota 10 la informatică.
              </li>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Am fost admis la Universitatea din București pe baza performanțelor din cadrul
                olimpiadelor scolare.
              </li>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Am experiență în predarea informaticii la nivel universitar, în calitate de asistent
                universitar, unde am lucrat direct cu studenți și am susținut activități practice.
                Această experiență mă ajută să explic concepte complexe într-un mod clar și
                accesibil copiilor.
              </li>
              <li class="text-muted">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Sunt programator activ, cu experiență în dezvoltarea de aplicații software reale.
                Lucrez în prezent ca programator backend, ceea ce îmi permite să aduc la cursuri
                exemple concrete din lumea IT și să îi ajut pe copii să înțeleagă cum este folosită
                informatica în viața reală.
              </li>
            </ul>
          </div>
        </div>
        <div class="grid md:grid-cols-2 gap-8 items-center mt-16">
          <div class="rounded-lg h-150 order-2">
            <img
              src="/images/Ana.jpeg"
              alt="Profesorii IT Bridge School"
              class="w-full h-full object-cover rounded-lg"
            />
          </div>
          <div class="order-1">
            <h2 class="text-3xl font-bold mb-6">Alexe Ana Iulia</h2>
            <p class="text-muted mb-4">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam vel sagittis sem.
              Suspendisse purus turpis, gravida vitae lobortis et, maximus sed leo. Vivamus
              consectetur nulla dolor. Phasellus rutrum nibh sed dolor ultrices cursus. In pharetra
              ut est nec molestie. Ut in libero et felis accumsan tincidunt quis sed eros.
            </p>
            <p class="text-muted mb-4">Uite cateva din reușitele mele profesionale:</p>
            <ul>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Integer sodales lacinia justo, quis semper lorem gravida sit amet. Vivamus imperdiet
                fringilla augue nec convallis. Aliquam gravida eros urna, at vulputate dui
                ullamcorper at.
              </li>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Etiam porta eu metus in molestie.
              </li>
              <li class="text-muted mb-2">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Quisque tortor dolor, tristique eu laoreet vel, rutrum eget arcu. Phasellus ac urna
                nec sapien fermentum sagittis non vestibulum purus. Vivamus dapibus bibendum eros,
                sit amet molestie sem cursus aliquam. Etiam at mi et nulla molestie gravida. Nunc
                nulla urna, elementum a erat in, mollis suscipit erat.
              </li>
              <li class="text-muted">
                <UIcon
                  name="i-lucide-corner-down-right"
                  class="text-primary w-5 h-5 shrink-0 mt-0.5 inline-block mr-2"
                />
                Nam dictum odio risus, ut consequat magna molestie sed. Vivamus nisl sem, faucibus
                lobortis purus nec, pharetra tristique neque. Morbi id vestibulum magna.
              </li>
            </ul>
          </div>
        </div>

        <!-- Values Section -->
        <div>
          <h2 class="text-3xl font-bold mb-8 text-center">Valorile Noastre</h2>
          <div class="grid md:grid-cols-3 gap-6">
            <UCard>
              <template #header>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-star" class="text-primary w-6 h-6" />
                  <h3 class="font-semibold">Excelență</h3>
                </div>
              </template>
              <p class="text-muted">
                Ne străduim să oferim educație de cea mai bună calitate, cu instructori
                experimentați și resurse de top.
              </p>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-heart" class="text-primary w-6 h-6" />
                  <h3 class="font-semibold">Pasiune</h3>
                </div>
              </template>
              <p class="text-muted">
                Suntem pasionați de ceea ce facem și ne place să insuflăm această pasiune și
                copiilor pe care îi pregătim.
              </p>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-lightbulb" class="text-primary w-6 h-6" />
                  <h3 class="font-semibold">Inovație</h3>
                </div>
              </template>
              <p class="text-muted">
                Inovația este la inima a ceea ce facem. Îmbogățim constant metodologia noastră cu
                noi tehnologii.
              </p>
            </UCard>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-2">
      <UCard color="neutral" class="py-8 border-0" variant="soft">
        <div class="max-w-4xl mx-auto text-center">
          <h2 class="text-3xl font-bold mb-6 text-secondary">
            Gata să faci Parte din Familia Noastră?
          </h2>
          <p class="text-lg text-muted mb-8">
            Alege cursul perfect pentru copilul tău și părcurgi această aventură extraordinară cu
            noi.
          </p>
          <UButton size="lg" to="/courses"> Explorează Cursurile Noastre </UButton>
        </div>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "default" as any,
  title: "Despre Noi - IT Bridge School",
});
</script>

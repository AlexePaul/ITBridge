<template>
  <div>
    <!-- Header -->
    <section class="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-primary/10 to-secondary/10">
      <div class="max-w-6xl mx-auto">
        <h1 class="text-4xl font-bold mb-4">Despre Noi</h1>
        <p class="text-lg text-muted">Transformăm copiii în creatori de tehnologie</p>
      </div>
    </section>

    <!-- Main Content -->
    <section class="py-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto space-y-12">
        <!-- About Section 1 -->
        <div class="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 class="text-3xl font-bold mb-6">Cine Suntem?</h2>
            <p class="text-muted mb-4">
              IT Bridge School este o academie de IT dedicată copiilor din București. Suntem
              pasionați de educație și de tehnologie, și credem că fiecare copil merită o șansă de
              a-și descubre potențialul în domeniul IT.
            </p>
            <p class="text-muted mb-4">
              Fondată cu scopul de a oferi educație de calitate în domeniu informaticii, academia
              noastră a ajutat sute de copii să descoperă pasiunea lor pentru tehnologie și să
              dezvolte abilități care îi vor ajuta în viitoarele lor cariere.
            </p>
            <p class="text-muted">
              Metodologia noastră de predare este bazată pe experiență practică, proiecte reale și o
              abordare interactivă care face ca învățarea să fie divertisantă și eficientă.
            </p>
          </div>
          <div class="bg-primary/5 rounded-lg h-96"></div>
        </div>

        <!-- About Section 2 -->
        <div class="grid md:grid-cols-2 gap-8 items-center">
          <div class="bg-primary/5 rounded-lg h-96 order-2 md:order-1"></div>
          <div class="order-1 md:order-2">
            <h2 class="text-3xl font-bold mb-6">Misiunea Noastră</h2>
            <p class="text-muted mb-4">
              Misiunea noastră este să pregătim o generație de tineri talentați, capabili să se
              adapteze rapid la schimburile din domeniu IT și să devină lideri în inovație.
            </p>
            <p class="text-muted mb-4">
              Credem că educația nu ar trebui să fie doar despre dobândirea de cunoștințe, ci și
              despre dezvoltarea unui spirit critic, a creativității și a abilității de a lucra în
              echipă.
            </p>
            <p class="text-muted">
              Prin cursurile noastre, copiii nu doar că învață programare și alte abilități IT, ci
              și cum să-și dezvolte gândirea critică și cum să abordeze problemele din perspective
              diferite.
            </p>
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
                Ne straduin să oferi educație de cea mai bună calitate, cu instructori experimentați
                și resurse de top.
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
                Suntem apasionați de ceea ce facem și ne place să insuflăm această pasiune și
                copiilor noștri.
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
                Innovation este la inima ceea ce facem. Imbogățim constant metodologia noastră cu
                noi tehnologii.
              </p>
            </UCard>
          </div>
        </div>

        <!-- Stats Section -->
        <div class="bg-primary/5 rounded-lg p-12">
          <div class="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div class="text-4xl font-bold text-primary mb-2">500+</div>
              <p class="text-muted">Elevi ai Absolvenți</p>
            </div>
            <div>
              <div class="text-4xl font-bold text-primary mb-2">6+</div>
              <p class="text-muted">Cursuri Disponibile</p>
            </div>
            <div>
              <div class="text-4xl font-bold text-primary mb-2">10+</div>
              <p class="text-muted">Instructori Experimentați</p>
            </div>
            <div>
              <div class="text-4xl font-bold text-primary mb-2">5★</div>
              <p class="text-muted">Recenzii Clienți</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-primary/10 to-secondary/10">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-3xl font-bold mb-6">Gata să faci Parte din Familia Noastră?</h2>
        <p class="text-lg text-muted mb-8">
          Alege cursul perfect pentru copilul tău și părcurgi această aventură extraordinară cu noi.
        </p>
        <UButton size="lg" to="/courses"> Explorează Cursurile Noastre </UButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "default" as any,
  title: "Despre Noi - IT Bridge School",
});
</script>

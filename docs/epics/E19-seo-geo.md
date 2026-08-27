# E19 · SEO, GEO și conținut

**Status:** propus · **Pistă:** Public · **Depinde de:** E08, E18 · **Blochează:** —

## Problemă

Baza tehnică de SEO e aproape de zero. Verificat în cod:

- **Nicio pagină nu folosește `useSeoMeta` sau `useHead` propriu.** Singurul titlu vine din
  `it-bridge-frontend/app/layouts/default.vue`, care citește `route.meta.title` setat prin `definePageMeta`. Deci există
  titluri, dar **nicio meta descriere, niciun Open Graph, niciun canonical, niciun Twitter card**.
  O pagină partajată pe Facebook sau WhatsApp apare fără imagine și fără descriere.
- **Fără sitemap.** Nu există `@nuxtjs/sitemap`, nu există `sitemap.xml`.
- **`robots.txt` e gol de instrucțiuni** — `User-Agent: *` urmat de `Disallow:`. Permite tot, ceea
  ce e corect, dar nu indică niciun sitemap.
- **Fără date structurate.** Niciun JSON-LD. Pentru o școală locală, e cea mai mare oportunitate
  ratată: `EducationalOrganization`, `Course`, `LocalBusiness`, `FAQPage` sunt exact tipurile pe
  care Google le folosește pentru rezultate îmbogățite.
- **Core Web Vitals compromise de imagini.** Vezi [E18](E18-frontend-portal.md), S2 — un PNG de
  1.9MB pe pagina principală.
- **Fără conținut.** Patru pagini de prezentare, fără blog, fără resurse, fără nimic care să atragă
  o căutare informațională.
- **Fără dimensiune locală.** Cu două locații, ar trebui să existe câte o pagină pentru fiecare,
  optimizată pentru căutări cu intenție locală. Nu există niciuna.

**GEO** — optimizarea pentru motoarele generative — e o problemă înrudită, dar nu identică. Când un
părinte întreabă un asistent AI "unde îmi duc copilul de 9 ani să învețe programare în [oraș]",
răspunsul se construiește din surse pe care modelul le poate citi și cita. Un site fără date
structurate, fără afirmații verificabile și fără conținut specific nu are cum să fie citat.

## Rezultat

Un părinte care caută cursuri de programare pentru copii în orașele voastre găsește școala, în
Google și în asistenții AI. Fiecare locație și fiecare modul are propria pagină care poate fi găsită.

## În scop

- Fundația tehnică: meta, canonical, sitemap, robots, redirecționări.
- Date structurate complete.
- Pagini per locație și per modul.
- Core Web Vitals.
- Strategie de conținut.
- Pregătire specifică pentru motoare generative.
- Măsurare.

## În afara scopului

- Publicitate plătită și funnel — vezi [E20](E20-achizitie-lead.md).
- Forma vizuală — vezi [E18](E18-frontend-portal.md).

## Story-uri

### S1 · Fundația tehnică

`useSeoMeta` pe fiecare pagină: titlu, descriere, Open Graph, Twitter card, canonical. Imagini OG
generate, eventual dinamic pentru paginile de modul. `@nuxtjs/sitemap` cu sitemap generat, referit
din `robots.txt`. Verificat că randarea pe server e activă pentru tot ce trebuie indexat.

**Acceptanță:** fiecare pagină publică are titlu unic, descriere unică și canonical. O legătură
partajată pe WhatsApp arată imagine și descriere.

### S2 · Date structurate

JSON-LD pe fiecare tip de pagină:

- `EducationalOrganization` pentru școală, o dată.
- `LocalBusiness` pentru fiecare locație, cu adresă, coordonate, program, telefon — din
  [E08](E08-multi-locatie.md).
- `Course` pentru fiecare modul din [E10](E10-curriculum-module.md), cu vârstă, durată, preț.
- `FAQPage` pentru întrebări frecvente.
- `BreadcrumbList` pentru navigare.

**Acceptanță:** testul de rezultate îmbogățite Google trece fără erori pe fiecare tip de pagină.

### S3 · Pagini locale

O pagină per locație: adresă, hartă, program, sălile, grupele care se țin acolo, profesorii,
fotografii reale, indicații de acces. Optimizată pentru căutarea cu intenție locală.

În paralel, în afara site-ului: Google Business Profile pentru fiecare locație, cu nume, adresă și
telefon **identice** cu cele de pe site — inconsecvența e una dintre cele mai frecvente cauze de
poziționare locală slabă.

**Acceptanță:** ambele locații au pagină proprie și profil Google complet, cu date identice.

### S4 · Pagini de modul

Fiecare modul din catalog are URL propriu: ce se învață, pentru ce vârstă, câte ședințe, cât costă,
unde se ține, ce a construit un copil la finalul lui — legat de vitrina din
[E14](E14-proiecte-elevi.md).

Sunt paginile care răspund la căutări specifice, de tipul "curs Scratch copii 8 ani", și au intenție
comercială mult mai clară decât pagina principală.

**Acceptanță:** fiecare modul are pagină indexabilă, generată din catalog.

### S5 · Performanță

Core Web Vitals în verde pe mobil, unde e majoritatea traficului. Depinde aproape în întregime de
[E18](E18-frontend-portal.md), S2.

**Acceptanță:** LCP sub 2.5s, INP sub 200ms, CLS sub 0.1, măsurate pe date reale, nu în laborator.

### S6 · Conținut

Un plan editorial care răspunde la ce caută părinții înainte să știe că vor un curs: de la ce vârstă
are sens programarea, Scratch sau Python, cât timp în fața ecranului e prea mult, ce face un copil
la un curs de robotică.

Cantitatea contează mai puțin decât specificitatea. Un articol care spune ce s-a întâmplat concret
la un curs, cu proiecte reale, valorează mai mult decât zece articole generice.

**Acceptanță:** un ritm sustenabil — două articole pe lună sunt mai bune decât zece într-o lună și
niciunul după.

### S7 · Pregătire pentru motoare generative

Ce diferă față de SEO clasic:

- **Afirmații verificabile și specifice.** "Grupe de maximum 10 copii, 12 ședințe pe modul, în două
  locații în [oraș]" e citabil. "Cea mai bună școală de IT" nu e.
- **Întrebare și răspuns explicit.** Conținut structurat ca răspuns direct la o întrebare, cu
  răspunsul în primul paragraf.
- **`llms.txt`** la rădăcină, care descrie ce e site-ul și ce conține.
- **Crawlerele AI permise explicit** în `robots.txt` — GPTBot, ClaudeBot, PerplexityBot și
  celelalte. Decizie conștientă: le lăsăm să citească pentru a fi citați.
- **Datele structurate din S2** contează dublu aici, pentru că sunt citibile fără interpretare.
- **Prezență în surse terțe** pe care modelele le consultă: directoare locale, recenzii Google,
  presă locală.

**Acceptanță:** o întrebare de tipul "unde învață copiii programare în [oraș]" pusă unui asistent AI
returnează școala. Măsurat periodic, manual — nu există încă unealtă serioasă pentru asta.

### S8 · Măsurare

Search Console pe ambele proprietăți, analiză de trafic care respectă consimțământul din
[E07](E07-securitate-gdpr.md), urmărirea pozițiilor pe cuvintele care contează, și verificarea
manuală a răspunsurilor generative.

**Acceptanță:** un raport lunar care arată ce s-a mișcat și de ce.

## Dependențe

[E08](E08-multi-locatie.md) pentru datele de locație, [E18](E18-frontend-portal.md) pentru
performanță, [E10](E10-curriculum-module.md) pentru paginile de modul,
[E14](E14-proiecte-elevi.md) pentru conținutul cel mai autentic.

## Riscuri

**SEO local dă rezultate în luni, nu în săptămâni.** Așteptările trebuie așezate de la început,
altfel epicul va fi considerat un eșec la o lună după lansare.

**GEO e un teren instabil.** Practicile se schimbă rapid și nimeni nu are date solide. Recomandarea
e să nu se investească peste ce e util oricum pentru SEO clasic — date structurate bune și conținut
specific ajută în ambele cazuri, indiferent cum evoluează.

**Conținutul cere autor.** E la fel de blocant ca la [E10](E10-curriculum-module.md): partea tehnică
e câteva zile, scrisul e continuu.

## Definition of done

Fiecare pagină publică are meta complet și date structurate valide. Ambele locații au pagină și
profil Google. Core Web Vitals în verde. Un ritm de conținut care se ține.

## Întrebări deschise

- ~~Care sunt orașele și cartierele exacte ale celor două locații?~~ Ambele în București:
  Strada Valea Oltului 73, Sector 6, în Drumul Taberei, și Șoseaua București–Târgoviște 19A,
  Sector 1, în Străulești. Fiecare are pagină proprie, cu coordonate verificate.
- Există deja Google Business Profile pentru vreuna? **Cea mai importantă întrebare deschisă din
  epic.** Pentru căutările locale, pachetul local de pe hartă stă deasupra rezultatelor organice,
  iar asistenții AI compun răspunsul despre „unde învață copiii programare în București" mai mult
  din profiluri și recenzii decât din site. Două profiluri verificate, cu nume, adresă și telefon
  identice cu cele din `apps/web/shared/school.ts`, valorează mai mult decât orice schimbare de cod
  rămasă în acest epic.
- Cine scrie conținutul? (S6 nu poate începe fără răspuns.)
- Se țintește și publicul vorbitor de engleză? Ar însemna site bilingv, cu costul aferent.
  Observație din cercetare: limba întrebării schimbă sursele pe care le citează un asistent, deci
  un site românesc e răspunsul corect pentru un părinte care întreabă în română.
- Ce grupe se țin efectiv la fiecare locație, și cu ce profesor? Paginile de locație spun acum
  onest că se stabilește la înscriere; e singurul lucru care le mai ține să semene între ele.

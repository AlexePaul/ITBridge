# E19 · SEO, GEO și conținut

**Status:** în lucru · **Pistă:** Public · **Depinde de:** E08, E18 · **Blochează:** —

**Livrate:** S1 (fundația tehnică), S2 (date structurate), S3 (pagini locale), S7 (motoare
generative) și S9 (legăturile rupte, intrată din lista de lansare,
[`docs/lansare.md`](../lansare.md)). **Rămân:** S4 (pagini de modul, care așteaptă
[E10](E10-curriculum-module.md)), S5 (performanță — partea de imagini, împreună cu S2 din
[E18](E18-frontend-portal.md)), S6 (conținut, blocat de întrebarea „cine scrie”) și S8 (măsurare —
Search Console e configurat; analiza de trafic nu mai e blocată de consimțământ, fiindcă E07 S5 i-a
construit poarta, ci e o alegere de unealtă).

**Cele două profiluri Google Business sunt create**, câte unul per adresă — lucrul care nu era cod
și care, la căutările locale, cântărește mai mult decât orice a rămas de scris aici. De acum sunt o
obligație de întreținere: NAP-ul din ele trebuie să rămână identic cu `apps/web/shared/school.ts`.

## Problemă

Baza tehnică de SEO e aproape de zero. Verificat în cod:

Punctele tăiate au fost rezolvate; sunt lăsate ca să se vadă de unde s-a plecat.

- ~~**Nicio pagină nu folosește `useSeoMeta` sau `useHead` propriu.** Deci există titluri, dar
  **nicio meta descriere, niciun Open Graph, niciun canonical, niciun Twitter card**.~~ Rezolvat în
  S1: `apps/web/app/composables/useSeo.ts` scrie toate astea dintr-un singur loc, iar textul fiecărei
  pagini stă în `apps/web/shared/seo.ts`, unde cele șapte se citesc una lângă alta.
- ~~**Fără sitemap.** Nu există `@nuxtjs/sitemap`, nu există `sitemap.xml`.~~ Rezolvat, fără modul:
  `apps/web/server/routes/sitemap.xml.ts` îl generează din aceleași constante ca paginile.
- ~~**`robots.txt` e gol de instrucțiuni** — permite tot, dar nu indică niciun sitemap.~~ Rezolvat:
  generat dintr-o rută, cu `Sitemap:` care arată către domeniul real, cu zonele private excluse și
  cu un `Disallow: /` pe preview-urile Vercel, ca să nu concureze domeniul de producție.
- ~~**Fără date structurate.** Niciun JSON-LD.~~ Rezolvat în S2: un singur `@graph` per pagină,
  construit în `apps/web/shared/structured-data.ts`.
- ~~**Core Web Vitals compromise de imagini** — un PNG de 1.9MB pe pagina principală.~~ Fișierul e
  șters; nicio imagine nu mai trece de 200KB. Restul de S5 rămâne — vezi mai jos.
- **Fără conținut.** Patru pagini de prezentare, fără blog, fără resurse, fără nimic care să atragă
  o căutare informațională. **Nerezolvat** — e S6, și e blocat de întrebarea „cine scrie”.
- ~~**Fără dimensiune locală.** Cu două locații, ar trebui să existe câte o pagină pentru fiecare.~~
  Rezolvat în S3: `/locatii/drumul-taberei` și `/locatii/straulesti`, scrise separat, nu generate
  dintr-un șablon.

**GEO** — optimizarea pentru motoarele generative — e o problemă înrudită, dar nu identică. Când un
părinte întreabă un asistent AI "unde îmi duc copilul de 9 ani să învețe programare în București",
răspunsul se construiește din surse pe care modelul le poate citi și cita. Un site fără date
structurate, fără afirmații verificabile și fără conținut specific nu are cum să fie citat.

## Rezultat

Un părinte care caută cursuri de programare pentru copii în București găsește școala, în
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

### S1 · Fundația tehnică — livrat

`useSeoMeta` pe fiecare pagină: titlu, descriere, Open Graph, Twitter card, canonical. Imagini OG
generate, eventual dinamic pentru paginile de modul. `@nuxtjs/sitemap` cu sitemap generat, referit
din `robots.txt`. Verificat că randarea pe server e activă pentru tot ce trebuie indexat.

**Acceptanță:** fiecare pagină publică are titlu unic, descriere unică și canonical. O legătură
partajată pe WhatsApp arată imagine și descriere.

### S2 · Date structurate — livrat

JSON-LD pe fiecare tip de pagină:

- `EducationalOrganization` pentru școală, o dată.
- `LocalBusiness` pentru fiecare locație, cu adresă, coordonate, program, telefon — din
  [E08](E08-multi-locatie.md).
- `Course` pentru fiecare modul din [E10](E10-curriculum-module.md), cu vârstă, durată, preț.
- `FAQPage` pentru întrebări frecvente.
- `BreadcrumbList` pentru navigare.

**Acceptanță:** testul de rezultate îmbogățite Google trece fără erori pe fiecare tip de pagină.

### S3 · Pagini locale — livrat

O pagină per locație: adresă, hartă, program, sălile, grupele care se țin acolo, profesorii,
fotografii reale, indicații de acces. Optimizată pentru căutarea cu intenție locală.

În paralel, în afara site-ului: Google Business Profile pentru fiecare locație, cu nume, adresă și
telefon **identice** cu cele de pe site — inconsecvența e una dintre cele mai frecvente cauze de
poziționare locală slabă.

**Acceptanță:** ambele locații au pagină proprie și profil Google complet, cu date identice.

**Jumătate îndeplinită, și e jumătatea mai ușoară.** Paginile există, scrise una câte una: secțiuni
diferite, întrebări frecvente diferite, note de acces diferite, cu coordonatele verificate în
OpenStreetMap și cu trimiteri reciproce. **Profilurile Google nu există**, iar fără ele acceptanța
nu e atinsă — pentru orice căutare locală de aici, pachetul de pe hartă stă deasupra rezultatelor
organice. Numele, adresa și telefonul trebuie luate caracter cu caracter din
`apps/web/shared/school.ts`, iar URL-urile profilurilor adăugate apoi în `sameAs`-ul fiecărui nod
de locație din `structured-data.ts`.

**Ce s-a decis să NU se construiască:** pagini pe cartiere — `/militari`, `/ghencea`, `/baneasa` —
peste aceleași două săli. Două adrese, două pagini. Mai multe ar fi tiparul de „doorway pages" pe
care Google îl numește explicit, și singura mișcare din tot epicul care ar putea aduce o penalizare.

**Livrat, ambele jumătăți.** Paginile de locație sunt pe site, iar **cele două profiluri Google
Business sunt create**, unul per adresă — partea care nu era cod și care, la căutările locale,
cântărește mai mult decât orice a rămas de scris în repo.

**De aici încolo profilurile sunt o obligație de întreținere, nu una de construit.** NAP-ul — nume,
adresă, telefon — trebuie să rămână identic cu `apps/web/shared/school.ts`, fiindcă inconsecvența e
cea mai frecventă cauză de poziționare locală slabă.

### S4 · Pagini de modul — muncă viitoare, așteaptă E10

Fiecare modul din catalog are URL propriu: ce se învață, pentru ce vârstă, câte ședințe, cât costă,
unde se ține, ce a construit un copil la finalul lui — legat de vitrina din
[E14](E14-proiecte-elevi.md).

Sunt paginile care răspund la căutări specifice, de tipul "curs Scratch copii 8 ani", și au intenție
comercială mult mai clară decât pagina principală.

**Acceptanță:** fiecare modul are pagină indexabilă, generată din catalog.

### S5 · Performanță — **LIVRAT**

Core Web Vitals în verde pe mobil, unde e majoritatea traficului. Depinde aproape în întregime de
[E18](E18-frontend-portal.md), S2.

**Acceptanță:** LCP sub 2.5s, INP sub 200ms, CLS sub 0.1, măsurate pe date reale, nu în laborator.

**Livrat odată cu [E18](E18-frontend-portal.md) S2**, fiindcă era același lucru. Imaginile coboară de
la **1056KB la 239KB** — 77% mai puțin — prin `srcset` pe lățimile reale ale layout-ului și WebP cu
rezervă JPEG. Prima imagine a caruselului, care e LCP-ul paginii principale, are `<link rel=preload>`
cu `imagesrcset`, deci browserul începe să o ia în dimensiunea corectă înainte să termine de parsat
foaia de stil.

CLS era deja rezolvat înainte: fiecare imagine are `width` și `height`, iar caruselul are
`aspect-ratio` pe container, deci nimic nu sare.

**Ce rămâne de făcut:** măsurarea _pe date reale_, adică pe trafic. Domeniul e live și Search
Console vede site-ul (S8), deci ce lipsește acum sunt săptămânile de vizite din care raportul Core
Web Vitals să poată spune ceva — o citire, nu o lucrare, consemnată aici când există. Cifrele de mai
sus sunt de laborator, ceea ce acceptanța spune explicit că nu e suficient — deci story-ul e livrat
ca lucrare, dar confirmarea vine de la Google.

### S6 · Conținut — muncă viitoare, blocat

Un plan editorial care răspunde la ce caută părinții înainte să știe că vor un curs: de la ce vârstă
are sens programarea, Scratch sau Python, cât timp în fața ecranului e prea mult, ce face un copil
la un curs de robotică.

Cantitatea contează mai puțin decât specificitatea. Un articol care spune ce s-a întâmplat concret
la un curs, cu proiecte reale, valorează mai mult decât zece articole generice.

**Acceptanță:** un ritm sustenabil — două articole pe lună sunt mai bune decât zece într-o lună și
niciunul după.

### S7 · Pregătire pentru motoare generative — livrat

Ce diferă față de SEO clasic:

- **Afirmații verificabile și specifice.** "Grupe de maximum 10 copii, 6-8 ședințe pe modul, în două
  locații în București" e citabil. "Cea mai bună școală de IT" nu e.
- **Întrebare și răspuns explicit.** Conținut structurat ca răspuns direct la o întrebare, cu
  răspunsul în primul paragraf.
- **`llms.txt`** la rădăcină, care descrie ce e site-ul și ce conține.
- **Crawlerele AI permise explicit** în `robots.txt` — GPTBot, ClaudeBot, PerplexityBot și
  celelalte. Decizie conștientă: le lăsăm să citească pentru a fi citați.
- **Datele structurate din S2** contează dublu aici, pentru că sunt citibile fără interpretare.
- **Prezență în surse terțe** pe care modelele le consultă: directoare locale, recenzii Google,
  presă locală.

**Acceptanță:** o întrebare de tipul "unde învață copiii programare în București" pusă unui asistent AI
returnează școala. Măsurat periodic, manual — nu există încă unealtă serioasă pentru asta.

### S8 · Măsurare — livrat parțial

Search Console pe ambele proprietăți, analiză de trafic care respectă consimțământul din
[E07](E07-securitate-gdpr.md), urmărirea pozițiilor pe cuvintele care contează, și verificarea
manuală a răspunsurilor generative.

**Acceptanță:** un raport lunar care arată ce s-a mișcat și de ce.

**Search Console e configurat pe ambele proprietăți** — `.com` și vechiul `.ro`, cu schimbarea de
adresă declarată, care e ce produce bannerul „unul dintre celelalte site-uri se mută în acest site".
Deci story-ul **nu mai e blocat de domeniul live**, cum spunea nota de aici: domeniul e live și
consola vede site-ul.

Ce rămâne e jumătatea de analiză de trafic, iar aia **așteaptă consimțământul din E07 S2**, nu
domeniul. Un script de analytics pus pe un site care servește părinți din UE, înaintea unui mecanism
de consimțământ, e o decizie juridică luată din greșeală — deci se face în ordinea aia, nu invers.
Urmărirea pozițiilor și verificarea răspunsurilor generative sunt activități manuale, lunare; nu au
cod de scris.

#### Starea măsurată, 1 septembrie 2026

Prima citire din Search Console, consemnată fiindcă „un raport lunar care arată **ce s-a mișcat**"
n-are de unde porni fără o linie de bază:

- **Redirecționări, 3 URL-uri** — `http://itbridgeschool.com`, `http://www.` și `https://www.`
  trimit toate spre canonicul `https://itbridgeschool.com`. E starea dorită, nu o problemă: Vercel
  le rezolvă, iar absența lor din raport ar fi fost semnul rău.
- **Descoperite și neaccesate, 5 URL-uri** — `/contact`, `/cursuri`, `/locatii` și cele două pagini
  de locație. Google le știe din sitemap, dar nu le-a accesat **niciodată**. E starea obișnuită a
  unui domeniu nou, cu buget de crawl mic; se rezolvă cu timpul și cu linkuri, iar între timp
  „Inspectare URL → Solicită indexarea" le urcă în coadă. Merită grăbite tocmai fiindcă alea sunt
  paginile care contează comercial — `/cursuri` și cele două locații sunt ce ar trebui să iasă la
  căutările locale din S3.
- **404, 2 URL-uri** — `/_nuxt/` (directorul de fișiere de build; 404 e răspunsul corect, se stinge
  singur) și `api.itbridgeschool.com`, care e o problemă de infrastructură, nu de SEO, și e scrisă la
  [E01](E01-infrastructura-medii.md).

**Ce NU e de reparat în cod:** sitemap-ul listează toate paginile publice, `robots.txt` are linia
`Sitemap:` și nu blochează nimic public, iar canonicele se rezolvă. Configurația e corectă;
neindexarea e o chestiune de timp și autoritate, iar o schimbare de cod făcută ca să pară că se face
ceva ar strica exact partea care merge.

#### Starea măsurată, 13 septembrie 2026

A doua citire, din raportul „Performanță în Căutare" exportat pe trei luni (până la 10 septembrie).
Cifrele sunt mici, dar spun ceva precis: **site-ul apare aproape numai la interogări în engleză și
fără legătură cu școala, și aproape deloc la cele în română pe care le tastează un părinte din
București.**

- **7 clicuri, 341 de expuneri, poziție medie 4,7**, toate pe pagina principală. `/despre-noi` are
  12 expuneri, iar `/about` — slug-ul vechi, englezesc, redirecționat 301 de la rescriere — încă 26,
  pe poziția 2,8: Google servește în continuare adresa veche. `/cursuri`, `/contact`, `/locatii` și
  cele două pagini de locație au **zero** expuneri — sunt exact cele cinci „descoperite și
  neaccesate" de la 1 septembrie, deci nu s-au mișcat.
- **Interogările cu expuneri sunt în engleză**: „schools" (119, poziția 3,6), „trade it" (74, cu
  variantele „traid it", „tradet it"), „bridge" (20), „training" (8), „trade school", „training
  centre", „it training center". Niciuna nu descrie școala; toate se potrivesc pe cuvintele din
  numele ei — _IT_, _Bridge_, _School_ — luate ca vorbe englezești, nu ca nume. Zero clicuri pe
  toate la un loc, ceea ce e corect: cine caută „schools" nu vrea o școală de programare din
  Drumul Taberei.
- **O singură interogare românească relevantă: „cursuri it"**, 12 expuneri, poziția 4,8, zero
  clicuri. Cuvântul _IT_ nu apărea în niciun titlu și în nicio descriere — paginile spuneau peste
  tot „informatică" —, deci rezultatul arăta un titlu care nu repeta ce tastase părintele. E singura
  cifră din raport pe care o poate mișca textul, și de la ea a pornit localizarea de mai jos.
- **Telefon 169 de expuneri, desktop 176**, cu poziția mai bună pe telefon (3,8 față de 5,6); 339
  din 345 de expuneri sunt din România.
- **Ritmul zilnic**: 15–35 de expuneri pe zi din 28 august, cu o zi cu clicuri la fiecare 3–4 zile.
  E linia de bază pentru citirea din octombrie, nu un rezultat.
- **Acoperirea, din raportul „Pagini" exportat în aceeași zi** (cu date până la 4 septembrie —
  raportul de indexare rămâne cu o săptămână în urma celui de performanță): **3 pagini indexate,
  9 neindexate**, neschimbat din 28 august — cele 3 redirecționări de mai sus, un 404 și cele 5
  „descoperite – nu sunt indexate", cu validarea începută din consolă în aceeași zi.

#### Trei zile mai târziu, 16 septembrie

Exporturile din 16 septembrie (date până la 14) corectează citirea de mai sus și dau primul semn
după localizare. Consemnate aici, nu într-o secțiune nouă, fiindcă sunt aceeași lună:

- **Cele cinci pagini erau indexate din 5 septembrie**, nu „la coadă": raportul de acoperire, cu
  o săptămână întârziere, arată saltul de la 3/9 la **8 indexate, 4 neindexate** în ziua aceea,
  iar „Descoperită – nu este indexată" e acum **zero, cu validarea reușită**. Cele 4 rămase sunt cele
  3 redirecționări și un 404 — starea dorită, nu o problemă. Deci indexarea a venit din validarea
  cerută la 1 septembrie și din prerandarea din 2 septembrie, **înaintea** localizării din 13.
- **Fiecare dintre cele cinci are acum expuneri**: `/cursuri` 12 (poziția 16, un clic),
  `/locatii/drumul-taberei` 13 (poziția 9,4), `/locatii` 2, iar `/locatii/straulesti` și
  `/contact` câte una. Pagina principală a urcat la 375 de expuneri și 12 clicuri; `/about`,
  slug-ul vechi, încă 35 de expuneri pe poziția 2,7 — Google nu recitise redirecționarea.
  „Solicită indexarea" s-a cerut pe 16 septembrie, pentru el și pentru cele cinci, deci în raport
  intră abia după 14.
- **Primele interogări românești dincolo de „cursuri it"** (13, poziția 4,8): „cursuri
  programare" (poziția 7), „cursuri de informatica" (11), „curs c++" (11), „cursuri c++" (20),
  „cursuri informatica" (22), „cursuri informatica elevi" (56), „cursuri informatica copii" (57) —
  câte una sau două expuneri fiecare. Pozițiile spun că paginile sunt **eligibile**, nu că se
  poziționează; până la 13 septembrie nu erau nici atât. Cele două cu „c++" sunt exact cererea pe
  care o așteaptă pagina `/cursuri/cpp` din PR-ul cu paginile pe unealtă, încă neîmbinat.
- **Englezescul n-a scăzut**: „schools" 128, „trade it" 75, „it school" 4 — e categoria de pe
  profil, care se schimbă în săptămâni după ce e schimbată, nu în zile.
- **11–14 septembrie: 6 clicuri din 56 de expuneri**, adică 11% față de 2% pe toată perioada de
  dinainte. Cifre prea mici ca să fie o concluzie, dar direcția e cea așteptată de la un titlu care
  repetă ce a tastat părintele. Localizarea a ajuns la Google cel mai devreme pe 13, deci citirea
  care contează e cea din octombrie, pe filtrul de interogări cu „copii", „programare",
  „informatică", „meditații" — nu totalul de expuneri, care va scădea când dispar cele englezești.

**Ce s-a schimbat în cod, pornind de aici** — localizarea semnalelor, nu conținut nou (acela e S6
și PR-ul cu paginile pe unealtă). Titlurile și descrierile spun „cursuri IT și programare pentru
copii", cu orașul, cartierul sau sectorul în fiecare, iar pagina principală și `/cursuri` nu mai
încep cu aceeași propoziție: prima are „IT", a doua „informatică", fiecare a rămas cu o singură
familie de căutări. `<h1>`-ul paginii principale poartă întrebarea părintelui, nu sloganul — din el
rescrie Google un titlu prea lung —, iar sloganul a rămas la aceeași mărime, ca `<p>`. Nodul
organizației spune `areaServed` pe București și Ilfov și se descrie ca „școală de IT și programare",
la fel ca `llms.txt` și subsolul; nodurile de locație se numesc exact ca profilul Google — brandul,
fără cartier, fiindcă regulile profilului interzic sufixul — cu cartierul ca `alternateName`, și
poartă în `sameAs` și în `hasMap` adresa profilului Google al fiecărei săli
(`googleBusinessProfile` în `school.ts`): legătura pe care S3 o lăsase biroului e făcută. `Content-Language: ro-RO` pleacă din antete, `<UApp>` primește
locale-ul român ca pe stage, iar `CONTENT_UPDATED_ISO` e ziua acestei treceri, ca `lastmod` să
spună adevărul despre paginile care chiar s-au schimbat.

**Ce NU s-a schimbat**: numele școlii rămâne _IT Bridge School_ în titluri, în `WebSite.name` și în
`og:site_name` — el aduce interogările englezești, dar e și ce tastează părinții care o știu („it
bridge", „bridge school"), și un nume nu se optimizează. Nici pagini pe cartiere, nici site
bilingv, nici cuvinte-cheie îndesate în text: „cursuri IT copii București" scris de trei ori pe o
pagină e exact tiparul pe care Google îl numește spam.

**Ce rămâne al biroului, în Search Console**: „Inspectare URL → Solicită indexarea" pe cele cinci
pagini fără expuneri, o dată, după ce ajung schimbările pe `release/prod`; și, pe cele două
profiluri Google Business, categoria principală în română („Școală de informatică" sau „Centru de
formare"), descrierea cu aceleași cuvinte ca site-ul și site-ul fiecărui profil îndreptat spre
pagina lui de locație, nu spre pagina principală.

### S9 · Legături rupte — livrat

Un crawler peste paginile pe care le publică `sitemap.xml`, care cere fiecare link intern din ele și
raportează ce nu răspunde 200. Rulează în CI, în același job cu verificarea de accesibilitate —
aceeași listă de pagini, același Chromium, în `apps/web/scripts/` lângă `check-a11y.mjs` —, deci un
link rupt pică PR-ul care l-a rupt, în loc să apară peste o lună în Search Console ca un 404 pe
care îl vede Google înaintea noastră.

„Rupt" înseamnă un `<a href>` intern care răspunde 404 sau 500, sau un `#fragment` care nu există
în pagina-țintă. Linkurile externe — hărțile, profilurile Google Business, rețelele — se verifică
separat și mai rar: un site terț picat pentru o oră nu e un motiv să pice CI-ul nostru. Alea intră
în citirea lunară din S8, de mână.

De ce n-a existat până acum: site-ul are șapte pagini, cele două de locație și cele trei legale, iar
linkurile dintre ele stau în componente partajate — `AppFooter`, navigația —, deci unul rupt s-ar fi
văzut la prima trecere prin site. E o gardă pentru site-ul de mâine, cu conținutul din S6 și paginile
din S4, unde linkurile vor fi în text, nu în componente, și unde nimeni nu mai trece prin toate.

A intrat din [`docs/lansare.md`](../lansare.md), singurul dintre cele douăzeci de puncte de acolo
care n-avea un story să-l țină.

**Acceptanță:** niciun link intern de pe nicio pagină din sitemap nu răspunde altceva decât 200,
iar un PR care rupe unul nu poate fi îmbinat.

**Livrat** ca `apps/web/scripts/check-links.mjs` — `pnpm test:links`, în CI lângă verificarea de
accesibilitate și cea de terți, cu care împarte serverul de probă, citirea sitemap-ului și
pornirea lui Chromium prin `preview-site.mjs`. Prima rulare: **240 de linkuri interne**, toate 200,
și 38 externe lăsate citirii lunare din S8. Patru lucruri de știut:

- **Linkurile se citesc din pagina randată, nu din sursă.** Browserul e oricum plătit de
  verificările vecine, și e ce are cititorul: un link construit la rulare intră, iar unul care
  există doar într-un `.vue` pe care nu-l randează nimeni nu.
- **Paginile vin din sitemap; țintele n-au de ce.** `/auth/login` e legat din navigație și e
  dinadins în afara sitemap-ului — dacă se rupe, e la fel de rupt ca oricare altul.
- **Fragmentele se verifică pe id-urile paginii-țintă**, nu pe codul de stare. Sunt jumătatea pe
  care un 200 n-o poate vedea, și cea care se rupe când se reformulează un titlu.
- **Constatările se grupează pe țintă**, fiindcă linkurile care se rup cel mai des sunt cele din
  `AppFooter` și din navigație, adică cele de pe toate paginile: negrupate, un singur link stricat
  raportează de unsprezece ori și îngroapă a doua constatare sub repetițiile primei.

Verificat pe ambele sensuri: cu un link către o pagină inexistentă și un `#fragment` inventat puse
în footer, verificarea le raportează pe amândouă, cu paginile de pe care pleacă, și iese cu 1.

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
- ~~Există deja Google Business Profile pentru vreuna?~~ **Răspuns: da, ambele sunt create.** Era
  cea mai importantă întrebare deschisă din epic, fiindcă pentru căutările locale pachetul de pe
  hartă stă deasupra rezultatelor organice, iar asistenții AI compun răspunsul despre „unde învață
  copiii programare în București” mai mult din profiluri și recenzii decât din site.

  Ce rămâne de aici încolo e întreținere, nu construcție: numele, adresa și telefonul din profiluri
  trebuie să rămână identice cu cele din `apps/web/shared/school.ts`. Dacă se schimbă vreodată una
  dintre ele, se schimbă în trei locuri — constanta, profilul, și orice listare terță — fiindcă NAP
  inconsecvent e cea mai frecventă cauză de poziționare locală slabă.

- Cine scrie conținutul? (S6 nu poate începe fără răspuns.)
- Se țintește și publicul vorbitor de engleză? Ar însemna site bilingv, cu costul aferent.
  Observație din cercetare: limba întrebării schimbă sursele pe care le citează un asistent, deci
  un site românesc e răspunsul corect pentru un părinte care întreabă în română.
- Ce grupe se țin efectiv la fiecare locație, și cu ce profesor? Paginile de locație spun acum
  onest că se stabilește la înscriere; e singurul lucru care le mai ține să semene între ele.

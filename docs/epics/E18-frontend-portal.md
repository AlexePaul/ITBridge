# E18 · Frontend: design system și portal părinte

**Status:** în lucru · **Pistă:** Public · **Depinde de:** E03 · **Blochează:** E19, E20

**Livrate:** S1 (fundația de design), S2 (pipeline de imagini), S3 (paginile publice), S4 (portalul
părintelui) și S7 (interfața profesorului), plus jumătatea din CI a lui S6 — verificarea automată de
accesibilitate, pe paginile publice, în ambele teme. **Rămân:** S5 și restul lui S6, plus verificarea
lui S4 pe date reale. Nimic din zona de după autentificare nu se poate demonstra până nu rulează un
backend — vezi [E01](E01-infrastructura-medii.md), S4.

> ## Cerut de școală: rescrierea întregii zone de după login
>
> **Tot ce e după autentificare arată prost și trebuie refăcut, nu peticit.** Nu e o observație
> despre o pagină anume — e despre toate: cele **6 pagini de portal** și cele **44 de ecrane de
> admin** (fișiere `.vue` sub `app/pages/`, numărate așa ca cifra să se poată verifica), inclusiv
> cele adăugate recent (`/admin/approvals`, `/admin/formare`, `/admin/invoices/emitere`,
> `/admin/anunturi`, `/admin/leads`).
>
> Motivul e vizibil cu ochiul liber: **paginile publice au fost rescrise pe sistemul din S1, cele
> autentificate nu.** Publicul folosește `classical.css` — paletă proprie, scară tipografică,
> spațiere. Zona autentificată folosește componentele Nuxt UI cu valorile implicite, iar `app.config.ts`
> doar mapează `primary` și `neutral` peste ele. Rezultatul e că un părinte trece de la un site care
> arată ca o școală serioasă la un panou care arată ca un instrument intern — exact în momentul în
> care tocmai a plătit.

Ecranele au fost construite în momente diferite, cu tipare diferite de tabel, filtrare,

> formular, stare goală și mesaj de eroare. De aceea e **rescriere, nu retuș**: cât timp nu există un
> tipar comun, fiecare ecran nou mai adaugă un dialect — și numărul chiar a crescut de la 28 la 44
> în timpul epicului, ceea ce e argumentul, nu o notă de subsol. Asta e S5, iar S4 e echivalentul pentru
> portalul părintelui — ambele își păstrează conținutul, dar niciunul nu mai e „muncă viitoare
> opțională".
>
> **Rămâne blocat de deploy, și asta nu s-a schimbat.** Un portal care nu poate fi nici testat pe
> date reale, nici arătat cuiva, se rescrie degeaba — vezi [E01](E01-infrastructura-medii.md) S4. Ce
> se schimbă e prioritatea: în ziua în care backend-ul rulează, S4 și S5 sunt primele, nu ultimele.
>
> **Ce se poate face înainte de deploy**, fiindcă nu cere un API care răspunde: tiparul de tabel, cel
> de formular, stările de încărcare, gol și eroare, și mutarea zonei de admin pe aceleași jetoane ca
> `classical.css`. Adică jumătatea de S5 care e despre componente, nu despre date.

## Problemă

Frontend-ul funcționează, dar arată ca un proiect intern, iar obiectivul declarat e opusul: să se
vadă din prima că școala predă serios.

Ce e concret în neregulă. Punctele tăiate au fost rezolvate; sunt lăsate ca să se vadă de unde s-a
plecat:

- ~~**Fără sistem de design.** @nuxt/ui 4 e instalat, dar folosit cu valorile implicite. Nu există
  identitate: nici paletă proprie, nici scară tipografică, nici spațiere consecventă.~~
  Rezolvat în S1: `apps/web/app/assets/css/classical.css` ține tot sistemul, iar
  `apps/web/app/app.config.ts` mapează `primary` și `neutral` ale Nuxt UI pe aceleași rampe, deci
  și zona de admin moștenește paleta.
- ~~**Imagini nepregătite.** `laptop.png` are 1.9MB, `02.jpeg` are 844KB, `01.jpg` are 326KB —
  servite brut, la dimensiune completă. Există și fișiere `02-old.jpeg`, `03-old.jpeg` rămase în
  repo.~~ Fișierele acelea au fost șterse și înlocuite cu fotografii reale, niciuna peste 200KB,
  toate cu `width` și `height` explicite. **`@nuxt/image` tot nu e instalat** și nu se servesc
  formate moderne — vezi S2, care rămâne parțial.
- **Portalul părintelui e sărac.** Șase pagini: `dashboard`, `profile`, `profile-setup`,
  `payments`, `absente` și `proiecte` — ultimele două aduse de E12 și E14, nu de o rescriere. Un părinte nu
  poate vedea orarul copilului, prezența, proiectele sau progresul — pentru că majoritatea nici nu
  există încă, dar nici structura nu le anticipează. Nerezolvat: **paginile de după autentificare
  nu au fost atinse de rescriere și nu sunt cablate la un backend care rulează.**
- **Zona de admin e inconsecventă.** 44 de ecrane construite în momente diferite, cu tipare
  diferite de tabel, filtrare, formular și mesaj de eroare. Nerezolvat.
- **Accesibilitate neverificată.** Rezolvat pe paginile publice: contrastul e conform AA
  (butoanele și legăturile folosesc `--color-accent-ink`, marginile de control un token separat la
  3:1), există legătură „Sari la conținut”, erorile de formular sunt legate prin `aria-describedby`
  și carusel are rol și etichete — iar din S6 **verificarea automată rulează în CI**, cu axe-core
  într-un Chromium adevărat, pe fiecare pagină din sitemap și în ambele teme. Rămâne zona
  autentificată, neverificată deloc: se face odată cu S4 și S5.
- **Fără stări de încărcare și eroare coerente.** `NotificationContainer` există; nu e clar că e
  folosit consecvent. Nerezolvat în zona autentificată.
- ~~**Fără mod întunecat**, deși @nuxt/ui îl suportă din start.~~ Paleta întunecată e definită în
  `classical.css`, iar `colorMode` urmează setarea de sistem a cititorului.

## Rezultat

Un părinte care intră pe site vede o școală serioasă. Un părinte autentificat își vede copilul —
orar, prezență, proiecte, progres, facturi — într-un loc. Un admin lucrează cu ecrane consecvente.

## În scop

- Sistem de design: culori, tipografie, spațiere, componente.
- Pipeline de imagini.
- Rescrierea paginilor publice.
- Extinderea portalului părintelui.
- Uniformizarea zonei de admin.
- Accesibilitate WCAG AA.
- Interfața profesorului, optimizată pentru telefon.

## În afara scopului

- Conținut și structură SEO — vezi [E19](E19-seo-geo.md). Aici e forma, acolo e substanța.
- Funcționalități noi de domeniu. Portalul afișează ce există; datele vin din epic-urile lor.

## Story-uri

### S1 · Fundația de design — livrat

Paletă, scară tipografică, spațiere, raze, umbre, mișcare — definite ca token-uri în
`apps/web/app/assets/css/classical.css`, cu `apps/web/app/app.config.ts` mapând peste ele
`primary` și `neutral` ale Nuxt UI. Mod întunecat din start, nu adăugat ulterior.

Identitatea trebuie să comunice două lucruri simultan: e pentru copii, deci caldă și jucăușă; și e
o școală serioasă, deci în care un părinte are încredere. Echilibrul dintre ele e decizia de design
centrală a acestui epic.

**Acceptanță:** nicio culoare și nicio dimensiune de font scrise direct într-o componentă. —
**Îndeplinită** pe paginile publice și pe componentele partajate.

### S2 · Pipeline de imagini — **LIVRAT**

`@nuxt/image` instalat și folosit peste tot. Formate moderne, dimensiuni responsive, încărcare
întârziată sub prima vizualizare, dimensiuni explicite ca să nu sară layout-ul. Fișierele `-old`
șterse.

**Acceptanță:** nicio imagine peste 200KB pe conexiune obișnuită. Deplasarea cumulativă a
layout-ului sub 0.1.

**Ce e făcut:** fișierele `-old` și `laptop.png` șterse; toate cele zece fotografii sunt sub 200KB
(cea mai mare 178KB, 1,1MB în total); `width` și `height` explicite peste tot, deci fără salt de
layout; `loading="lazy"` sub prima vizualizare; caruselul de pe prima pagină încarcă doar cadrul
curent și vecinii lui.

**Livrat.** `@nuxt/image` e instalat, iar cele patru locuri cu imagini folosesc `<NuxtPicture>`:
`srcset` pe lățimile din `classical.css`, WebP cu JPEG ca rezervă, redimensionare la cerere.

Măsurat pe cele nouă fotografii, la 620px — lățimea pe care o cere efectiv layout-ul:

|                         | Total       |
| ----------------------- | ----------- |
| Originale, servite brut | **1056 KB** |
| JPEG redimensionat      | 373 KB      |
| AVIF                    | 347 KB      |
| **WebP**                | **239 KB**  |

**AVIF a fost măsurat și respins**, ceea ce e invers față de ce ai presupune. La calitatea asta e
abia mai bun decât un JPEG redimensionat, iar pe o poză e chiar mai mare — encoder-ul AVIF din sharp,
la efortul lui implicit, nu e bun aici. Cum browserul ia **primul** `<source>` care se potrivește,
a-l pune pe AVIF înainte ar fi însemnat să servim tuturor varianta mai slabă. Dacă se reia, se
măsoară întâi.

Estimarea din story era ~670KB; rezultatul e 239KB, fiindcă cea mai mare parte a câștigului nu vine
din format, ci din faptul că nu mai trimitem o poză de 1200px într-un slot de 620.

Asta livrează și [E19](E19-seo-geo.md) S5, care era același lucru privit dinspre SEO.

### S3 · Paginile publice — livrat

`index`, `cursuri`, `despre-noi`, `contact` rescrise pe noul sistem, plus `locatii` și câte o
pagină per adresă — șapte în total. Contact, „despre” și paginile de locație arată ambele locații,
după [E08](E08-multi-locatie.md).

**Abatere de la plan, deliberată:** pagina de cursuri se alimentează din `apps/web/shared/courses.ts`,
nu din catalogul [E10](E10-curriculum-module.md), fiindcă E10 nu există încă. Fișierul e scris ca
sursă unică — aceleași constante alimentează pagina, datele structurate, `llms.txt` și `sitemap.xml`
— deci înlocuirea lui cu un fetch din E10 e o schimbare într-un singur loc, nu în șapte.

Apelul la acțiune duce la formularul de contact și la telefon, nu la lecția de probă din
[E20](E20-achizitie-lead.md), care nu e construită.

**Acceptanță:** un părinte care nu știe nimic despre școală înțelege în 30 de secunde ce se predă,
cui, unde și cât costă. — **Îndeplinită.**

### S4 · Portalul părintelui — livrat, rămâne verificarea pe date reale

De la trei pagini la un portal complet: privire de ansamblu pe copil, orar, prezență și recuperări,
proiecte, facturi și plăți, profil și preferințe de comunicare.

Construit ca structură acum, populat pe măsură ce epic-urile de domeniu livrează. Secțiunile fără
date încă spun asta explicit, nu rămân goale.

**Acceptanță:** un părinte cu doi copii comută între ei fără să se piardă.

**Intrarea în cont face parte din story, în trei ecrane, nu în două.** Decizia e a
[E11](E11-inscrieri-capacitate.md) S2 și e scrisă acolo; aici e ce înseamnă pentru desen:

1. **Creare cont** — nume, email, parolă. Un ecran de conversie: scurt și vizibil terminabil.
2. **Completează profilul** — telefon, adresă și contactul de urgență, obligatorii. Ecranul ăsta se
   deschide în două situații care arată diferit și trebuie să citească bine în amândouă: imediat
   după creare, unde e „pasul 2 din 2" și progresul se arată cinstit; și mai târziu, pentru o
   familie pe care adminul a introdus-o de la telefon și al cărei cont a fost legat după, unde nu e
   niciun pas 2 din nimic, ci „ne lipsesc câteva date". Nu inventa un wizard în al doilea caz.
3. **Cont în așteptare** — cele două porți din E11 S2 sunt independente și oricare poate fi deschisă
   prima, deci ecranul nu e o ușă încuiată, ci o stare **înăuntrul** portalului: un părinte
   neconfirmat se poate autentifica. Spune care poartă mai e închisă, oferă retrimiterea linkului și
   e explicit că singurul lucru blocat efectiv e repartizarea unui copil într-o grupă.

Cele trei nu sunt un flux liniar: un părinte poate avea profilul complet și emailul neconfirmat, sau
invers. Desenul trebuie să suporte oricare combinație fără să pară stricat.

**Livrat.** Șase ecrane de portal plus cele trei de intrare în cont, toate pe jetoanele din S1, cu
un shell propriu — `layouts/portal.vue`: navbar cu rândul de taburi sub el, nu bara laterală
colapsabilă a zonei de admin. Un părinte are șase pagini și le deschide pe telefon; un admin are
zeci și stă în aplicație toată ziua, iar o bară laterală ia o treime dintr-un ecran de
390px ca să aleagă între ele. Layout-ul `dashboard` rămâne al zonei de admin, care se
uniformizează în S5.

**Prezența e ecran propriu, nu un bloc pe Acasă.** Calendarul lunar exista dinainte, pe
`/user/dashboard`, și a fost mutat la `/user/prezenta` când Acasă a preluat ruta. Nu s-a întors pe
Acasă fiindcă acolo ar fi contrazis singurul lucru pe care ecranul acela îl are de făcut: o grilă de
42 de zile cu o legendă de cinci intrări, o dată pentru fiecare copil, împinge sub linia de plutire
exact ce cere atenție. Coloana de prezență recentă de pe Acasă arată ultimele patru ore și trimite
mai departe — o privire, plus o ușă pentru cine vrea luna.

Culorile lui s-au dus odată cu mutarea. Ecranul vechi picta cinci culori semantice din Nuxt UI, care
nu există în sistemul ăsta — o singură accentuare, aurul — și pe care oricum nu le poate citi cineva
care nu separă verdele de roșu. Fiecare zi poartă acum un **semn**: `✓` prezent, `A` absent, `R`
recuperare, `?` nemarcat, `○` oră programată. Primele trei sunt aceleași pe care le folosește deja
rândul de prezență recentă de pe Acasă, ca cele două ecrane să nu învețe două vocabulare pentru
același fapt. Ce înseamnă o zi rămâne decis de `calendarDayState` — funcția pură, testată, care nu
mai ghicește din `Group.weekday`; ecranul doar desenează ce întoarce ea.

Story-ul a fost multă vreme blocat, și motivul merită păstrat fiindcă e încă pe jumătate valabil:
**backend-ul nu e deployat**, deci nimic din ce e după login nu vorbește cu un API care rulează.
Ce s-a putut face fără el e desenul și structura; ce rămâne — verificarea pe date reale și pe
telefon — cere tot [E01](E01-infrastructura-medii.md) S4.

**Cum se rezolvă acceptanța.** Comutarea are două feluri de a se pierde și fiecare are alt răspuns:

- _Alegi un copil, urmezi un link și ajungi la celălalt._ Alegerea stă în URL (`?copil=`) și într-un
  cookie — URL-ul are prioritate, deci o pagină reîncărcată sau trimisă mai departe e despre același
  copil, iar cookie-ul o duce între Absențe și Proiecte, unde linkurile nu poartă query string.
  Aceeași mecanică și același motiv ca filtrul de locație din `locationStore`.
- _Citești prezența unui copil crezând că e a celuilalt._ La asta comutatorul nu ajută, oricât ar fi
  de vizibil: răspunsul e **redundanța** — fiecare bloc de date își repetă copilul în etichetă
  („MATEI · ORE VIITOARE"), deci numele nu e niciodată mai departe de cifre decât sunt cifrele între
  ele. Iar **Acasă nu comută deloc**: toți copiii, unul sub altul, fiindcă un răspuns la „e totul în
  regulă?" care e adevărat doar pentru copilul de pe tabul selectat nu e un răspuns.

Ecranele family-level — Plăți și Profil — n-au comutator, fiindcă nimic de pe ele nu e al unui
singur copil.

**Ce rămâne, și de ce nu e cod.** Portalul compilează, se randează și e cablat la composable-urile
existente, dar **backend-ul tot nu e deployat**, deci nimic din el n-a fost văzut pe date reale.
Verificarea pe familii adevărate și pe un telefon adevărat — inclusiv jumătatea de accesibilitate a
lui S6 pentru zona autentificată — cere [E01](E01-infrastructura-medii.md) S4. Până atunci
paginile autentificate poartă `noindex, nofollow` din layout, iar `/admin/` și `/user/` sunt excluse
din `robots.txt`, deci nimic din ele nu ajunge în index.

**Două lucruri pe care designul le cerea și codul nu le putea da**, rezolvate spunând adevărul în loc
să inventăm cifre:

- _Factura desfăcută pe copil_ („Matei — 4 ședințe × 87,50"). `Invoice` duce pe sârmă o lună, un
  total și o stare; foaia de lucru per copil e a adminului și n-are sume deloc. Regula e explicată în
  text, iar cifrele vin din `shared/courses.ts`, derivate din aceleași două numere lunare pe care le
  împarte la patru și `pricing.ts` — deci portalul nu poate cita un tarif după care nu se
  facturează.
- _Scadența pe cardul de plată._ Termenul de 14 zile e în `arrears.rules.ts` și nu iese pe sârmă
  către părinte. O a doua copie aici ar fi copia care rămâne în urmă, deci ecranul arată starea pe
  care API-ul o publică — neplătită sau restantă — și nimic altceva.

### S5 · Uniformizarea zonei de admin — muncă viitoare, **cerută explicit**

Un tipar unic de tabel — sortare, filtrare, paginare, acțiuni în masă, stare goală. Un tipar unic de
formular, cu validare și erori. Toate paginile aliniate. Selectorul de locație din
[E08](E08-multi-locatie.md) integrat în antet.

**Nu mai sunt 25 de ecrane, ci 44**, iar numărul crește cu fiecare epic livrat: E11 a adăugat
`/admin/approvals` și `/admin/formare`, E15 a adăugat `/admin/invoices/emitere`, E17 a adăugat
`/admin/anunturi` și `/admin/livrari`, E20 a adăugat `/admin/leads`. Fiecare a fost
construit cu tiparele pe care le-a găsit, adică fiecare a mai adăugat un dialect. **Costul crește cu
întârzierea**, ceea ce e argumentul pentru care jumătatea de componente merită făcută înainte de
deploy, nu după.

**Acceptanță:** o pagină nouă de admin se construiește din componente existente, fără CSS nou.

**Livrat parțial: jumătatea de componente** — cea care nu cere un API care rulează. Înaintea
oricărui cod s-a făcut un catalog al dialectelor pe cele 28 de ecrane de atunci: **7 feluri de tabel**
(UTable cu trei sub-dialecte de `h()`, un `<table>` nativ, rânduri din div-uri, grile de carduri),
**5 feluri de formular** — inclusiv două ecrane rămase pe `UFormGroup` din @nuxt/ui v2, care în v4
nu randează nimic —, **opt apariții** ale aceluiași `<select>` nativ cu șirul lui de clase
`border-gray-300`, și ~19 ecrane fără nicio stare de încărcare. Componentele sunt forma majoritară
a fiecărui tipar, nu o invenție:

- `AdminPage` — scheletul de pagină: titlu, subtitlu, slot de acțiuni, „Înapoi", lățime;
- `AdminLoading` / `AdminEmpty` / `AdminError` — triada de stări; eroarea primește o propoziție
  deja tradusă prin `apiErrorMessage`, ca să existe un singur traducător;
- `AdminTable` — vocabularul de `h()` copiat de trei ecrane de index, ca și configurare declarativă:
  coloane `id` / `badge` / `date` / `money`, antet cu iconiță, dropdown de acțiuni, gol în română.
  Tipul `date` formatează din componentele string-ului, niciodată prin `new Date()` — capcana UTC
  din CLAUDE.md. Fără sortare/paginare, deliberat: azi totul se ia întreg, iar contractul de
  paginare e o schimbare de API pe care backend-ul nedeployat n-o cere încă;
- `AdminListRow` — rândul identitate-plus-acțiuni pe care șase ecrane îl desenau de mână, pe
  jetoane în loc de `border-gray-200`;
- `AdminFormActions` — rândul de submit: `type="submit"` fără `@click` pereche (dublul-foc), cu
  `loading` în semnătură fiindcă 7 din 10 formulare au livrat fără el;
- `AdminConfirmModal` — un singur idiom de confirmare, care înlocuiește `confirm()` de browser și
  cele trei subsoluri de modal cu ordini diferite de butoane;
- `formatDateKey` / `formatLei` în `useAdminFormat.ts` — pure și ținute de vitest.

**Ecranul-dovadă e `/admin/calendar`** (E12 S2), migrat integral: shell, triadă, rânduri, USelect
în locul select-ului nativ, iar ștergerea a trecut de pe `confirm()` pe modal.

### S5b, prima felie — livrat

Migrarea a început de la întrebarea „unde e greu de ajuns la informație", nu de sus în jos pe listă.
Măsurat pe ecranele deschise cel mai des:

- **Meniul era o listă plată de douăzeci și cinci de intrări**, în ordinea în care le-au adăugat
  epicurile: „Restanțe" stătea între „Plăți" și „Reduceri" fiindcă E16 a venit după E15. Acum sunt
  șase grupe cu titlu — Zi de zi, Familii, Grupe și săli, Bani, Comunicare —, iar în interiorul unei
  grupe ordinea e a zilei de lucru, nu alfabetul: catalogul de azi înaintea orarului din care vine,
  emiterea înaintea urmăririi. Cele două legături publice au coborât la final: erau primele, adică
  singurele două pe care un admin nu le folosește niciodată erau primele două citite de fiecare dată.
- **`/admin/facturi` cheltuia un ecran întreg de desktop pe trei cartonașe care scriau „Facturi:
  10".** Numărul de facturi e singurul lucru dintr-o lună de facturare cu care nu poți face nimic.
  Acum sunt trei cifre sus — emis, încasat, rest — și un tabel pe luni cu familii, facturi, cât s-a
  emis, cât a intrat și cât a rămas. **Numerele se cer raportului financiar**, nu se recalculează
  aici: un al doilea `amount − plăți` într-un fișier Vue ar fi a doua definiție a restanței.
- **Lista de copii avea trei coloane din șase inutile.** `createdAt` se afișa brut, direct din
  driver — `2026-09-04T16:40:25.566Z` —, `#12` ocupa o coloană ca să arate o cheie de bază de date,
  iar o singură coloană înghesuia patru fapte: „Scratch Începători • Luni • 16:00 - 17:30 • Drumul
  Taberei · Sala 1". Acum: nume, **vârstă** în locul datei de naștere (ecranul se citește ca să
  repartizezi un copil, iar repartizarea e pe bandă de vârstă), părinte, grupă, când și unde.
- **Cardul de grupă își calcula singur locurile ocupate**, filtrând magazinul de copii din browser.
  Cifra nu era greșită azi — `Child.group` se scrie și pentru probe —, dar era **a doua definiție a
  unui număr pe care îl deține `occupancyOf`**, se sprijinea tăcut pe cât apucase browserul să
  încarce, și nu putea ști nimic despre lista de așteptare. Cere acum `GET /reports/occupancy`, deci
  cardul spune și „2 pe listă".

`ageOn` / `formatAge` intră în vocabularul comun, cu aceeași disciplină ca `formatDateKey`: vârsta
se calculează din componentele celor două string-uri, niciodată printr-un `new Date()`, fiindcă o zi
în plus sau în minus mută o aniversare peste an și un copil în altă bandă de vârstă.

**Rămân pentru S5b** — migrarea celorlalte ecrane, planificată de catalog: salvarea de la v2 a
celor două formulare, măturarea de limbă (dropdown-uri în engleză, „No data"), `AdminDateField`
(izolarea hack-ului fragil de popover din children/edit), bara de filtre (trei forme incompatibile
azi — se extrage după ce migrarea arată care supraviețuiește) și grila de carduri (cinci ecrane,
patru semantici; înainte de orice partajare, `GroupCard` trebuie mutat pe `occupancyOf` — D7).

### S6 · Accesibilitate — livrat parțial (verificarea automată, livrată)

Contrast conform WCAG AA, navigare completă din tastatură, focus vizibil, etichete și roluri ARIA,
text alternativ pe imagini semnificative. Verificare automată în CI.

**Acceptanță:** verificarea automată trece pe toate paginile publice și pe portal. Un flux complet
de autentificare se parcurge doar din tastatură.

**Ce e făcut, pe paginile publice și verificat manual:** contrastul textului e conform AA —
butoanele, legăturile la hover și numerele din liste au trecut de la accentul brut (3,02:1) la
`--color-accent-ink` (5,97:1); marginile câmpurilor de formular și ale punctelor de carusel au un
token propriu, `--color-control-border`, la 3,15:1 în temă deschisă și 3,09:1 în cea închisă, în
loc de 1,37:1. Există legătură „Sari la conținut”, `:focus-visible` pe tot, erorile de formular
sunt legate de câmpul lor prin `aria-describedby`, caruselul are rol, etichetă și comenzi
accesibile din tastatură, iar animațiile respectă `prefers-reduced-motion` — inclusiv la nivelul
la care o pagină fără JavaScript își arată tot conținutul.

**Verificarea automată, livrată.** `pnpm test:a11y` construiește `apps/web`, servește `.output` pe
un port local și trece axe-core peste fiecare pagină pe care o publică sitemap-ul, în temă deschisă
și în temă închisă, pe WCAG 2.0 și 2.1 nivel A și AA. Rulează în CI, în același job cu lint,
typecheck și build. Scriptul e `apps/web/scripts/check-a11y.mjs`; deciziile din el sunt fiecare un
mod în care verificarea ar fi putut fi verde degeaba:

- **Un browser adevărat, nu jsdom.** Varianta ieftină ar trece axe peste HTML-ul prerandat, fără
  motor de layout — și ar trece, fără să facă nimic din singurul lucru pentru care există: fără
  cascadă și fără layout, contrastul nu se poate calcula, deci axe îl sare. O bifă verde care nu
  poate vedea regresia pentru care a fost scrisă e mai rea decât nicio bifă, fiindcă cineva se
  bazează pe ea.
- **Ambele teme.** Token-urile pe care story-ul le-a ridicat sunt declarate de două ori, iar cele
  întunecate stau la 3,09:1 — destul de aproape de linie cât o editare să le treacă dincolo.
- **Paginile vin din sitemap**, nu dintr-o listă în script: `PUBLIC_PAGES` din `shared/seo.ts` îl
  alimentează deja, deci o pagină adăugată acolo e verificată fără să-și mai amintească nimeni s-o
  adauge a doua oară.
- **`best-practice` e lăsat deliberat pe dinafară.** Regulile alea sunt sfaturi, nu standardul, iar
  amestecate în verificare o fac să pice pentru lucruri cu care n-a fost nimeni de acord — așa ajunge
  o verificare să nu mai fie citită, ci sărită.
- **Rulează cu `prefers-reduced-motion: reduce`**, altfel măsoară un fade. Blocurile intră prin
  `classical-rise`, iar axe citește culoarea din clipa în care se uită: prinsă la jumătate, aceeași
  clasă `.lede` raportează 1,47:1 pe două pagini și 1,18:1 pe a treia, ceea ce nu e o problemă de
  contrast, e una de cronometru. Cu preferința pornită, `useReveal` iese devreme, nimic nu se ascunde
  și pagina măsurată e cea pe care o primește un cititor cu setarea aia — singura formă în care
  rezultatul e același de două ori.

**Verificarea a fost verificată.** Cu `--color-accent-ink` întors la accentul brut — exact culoarea
pe care story-ul a schimbat-o — verificarea cade pe fiecare pagină publică, în tema
deschisă, cu 2,61:1 și numele elementului. Cu el la loc, trece.

**Ce rămâne:** zona autentificată, neverificată deloc. Acceptanța cere și portalul, iar portalul se
rescrie în S4 și S5 — se verifică atunci, nu înainte, fiindcă altfel s-ar cimenta ecranele pe care
școala le-a cerut refăcute. Jumătatea de tastatură a acceptanței rămâne manuală: axe verifică ce e
în DOM, nu ce se întâmplă când cineva apasă Tab de douăzeci de ori.

### S7 · Interfața profesorului — livrat

Ecranul de marcare a prezenței din [E12](E12-prezenta-orar.md) S6 e folosit în picioare, într-o
sală, de pe telefon. Ținte de atingere mari, contrast bun, funcțional pe conexiune slabă.

**Încărcarea unui proiect de pe telefon nu mai e pe listă.**
[E14](E14-proiecte-elevi.md) a scos-o explicit din scop: fișierele intră prin agentul care
oglindește un folder de rețea, iar profesorul doar salvează lucrarea acolo, din programul în care
s-a lucrat. Nu există gest în interfață, deci nu există ecran de proiectat.

Ce rămâne dinspre [E14](E14-proiecte-elevi.md) e revizia: lista documentelor noi pe grupă și butonul
de trimitere din [E17](E17-comunicare-notificari.md) S8. Alea sunt **ecrane de admin, la birou** —
se proiectează cu restul zonei de admin, nu după regulile de telefon de mai sus.

**Acceptanță:** un profesor marchează prezența unei grupe de pe telefon, fără să mărească pagina.
— **Îndeplinită**, măsurată la 390×844 (iPhone 12), în ambele teme: nicio pagină din drumul
profesorului nu depășește lățimea ecranului, deci nu există pinch și nu există derulare laterală.

Ecranul în sine exista din E12 S6, cu butoanele lui mari și coada lui locală, iar story-ul ăsta
părea să fie despre retușuri. Măsurat pe un telefon adevărat, patru dintre cele cinci lucruri
găsite erau **în afara ecranului** — în cadru, în jetoane, în pipeline —, ceea ce e și explicația
pentru care nu le văzuse nimeni: se uita toată lumea la pagină.

- **Meniul era acoperit de filtrul de locație.** `LocationSwitcher` cerea 224px într-o bară de
  390px, iar grupul din dreapta al navbar-ului își păstra lățimea intrinsecă și creștea peste
  butonul de meniu din stânga. Din cele 44px ale lui rămâneau **10px** apăsabili; o atingere în
  centrul hamburgerului deschidea lista de locații. Pe telefon meniul e singurul drum către orice
  altceva, deci ecranul de prezență se putea deschide doar tastând adresa. Corectura e `min-w-0`
  pe grupul din dreapta plus un filtru care se strânge sub `sm` — un nume de locație tăiat costă un
  admin o privire, un hamburger acoperit costă un profesor tot meniul.
- **Accentul nu fusese niciodată tradus pentru Nuxt UI.** `classical.css` punea în variabilele lui
  Nuxt UI fundalul, textul și marginea, dar nu și accentul, deci `--ui-primary` rămăsese la 500-ul
  rampei — adică exact culoarea de 3:1 pe care S6 a scos-o din text pe partea publică. Fiecare buton
  outline sau ghost de după login citea la **2,61:1**, aceeași cifră și aceeași cauză, de partea
  cealaltă a autentificării. O linie per temă, `--ui-primary: var(--color-accent-ink)`, duce drumul
  profesorului la **axe curat pe WCAG 2.0 și 2.1 A+AA, în ambele teme** — și, fiind un jeton,
  ridică odată cu el toate cele 44 de ecrane de admin.
- **Iconițele veneau de la Iconify, la rulare.** Nicio colecție nu era instalată local, deci
  `@nuxt/icon` le cerea de pe `api.iconify.design` de fiecare dată — pe conexiunea din sală, exact
  cea pentru care există story-ul. Butonul de meniu **e** o iconiță și nimic altceva: fără ea, un
  buton gol. Cu `@iconify-json/lucide` instalat, bundle-ul are cele **43 de iconițe folosite,
  10,4KB**, servite de pe domeniul propriu; nu mai e nici o cerere către un terț la fiecare
  încărcare, ceea ce e și un lucru mai puțin de explicat în [E07](E07-securitate-gdpr.md).
- **Nuxt UI vorbea englezește.** Tot ce randează componenta pentru sine — eticheta hamburgerului,
  „No data" sub un tabel gol — vine din locale-ul lui, iar implicitul e engleza. `UApp :locale="ro"`
  le trece pe toate deodată: butonul care deschide meniul se prezenta unui profesor drept
  „Open sidebar". Convenția zice de mult că numai codul e în engleză; o etichetă pe care n-a
  scris-o nimeni e tot o etichetă pe care o citește cineva.
- **Coada promitea ceva ce nu făcea.** Bannerul spune „se retrimit singure", dar coada se golea
  doar la deschiderea ecranului și pe evenimentul `online` — care nu se declanșează pe conexiunea
  reală dintr-o sală, unde cererile mor dar `navigator.onLine` rămâne `true`. Acum are un backoff
  propriu, 5s dublat până la un minut; plafonul contează mai mult decât curba, fiindcă ora ține
  nouăzeci de minute și o curbă neplafonată ar renunța pe la mijlocul ei. Verificat cu rețeaua
  omorâtă fără ca browserul s-o admită: trei încercări în șaptesprezece secunde, iar la revenirea
  conexiunii coada s-a golit singură, fără reîncărcare și fără nicio atingere.

Restul sunt lucruri de pe ecran: ținte de cel puțin **44px** peste tot pe drumul profesorului
(„Înapoi", „Altă grupă", „Retrimite", „Sună părintele" și hamburgerul erau între 28 și 32px), și
`/admin/attendance` refăcut — trei cartonașe stivuite pe telefon în loc de trei coloane de `w-1/3`
înghesuite la 130px fiecare, cu „Prezența de azi" **prima**, fiindcă hub-ul nu o oferea deloc: se
ajungea la ea numai din meniul lateral, adică din exact lucrul pe care telefonul îl ascunde.

**Nu s-a construit o poartă automată pentru zona autentificată**, deși măsurătorile de mai sus
sunt exact ce ar rula într-una. S6 spune de ce, iar motivul ține în continuare: acceptanța ei
acoperă portalul, portalul se rescrie în S4 și S5, iar o poartă scrisă acum ar cimenta ecranele pe
care școala le-a cerut refăcute. Verificarea rămâne manuală până atunci, cu cifrele de aici ca
linie de bază.

**Ce nu s-a atins, deliberat:** cele 25 de intrări din meniul lateral. Pe telefon sunt o listă
lungă într-un panou care se deschide peste ecran, și e o problemă reală — dar e problema navigației
zonei de admin, adică S5b, iar cartonașul din hub îi dă profesorului al doilea drum de care avea
nevoie azi.

## Dependențe

[E03](E03-testare-ci.md) pentru typecheck și teste de componente.

## Riscuri

**Rescrierea vizuală în paralel cu funcționalități noi produce conflicte constante.** Fundația din
S1 și S2 merită făcută întâi, repede, ca restul să se construiască deja pe ea.

**Design-ul e o competență separată.** Dacă nu există cineva care să o facă, rezultatul va fi
"curat, dar generic" — ceea ce e mai bine decât acum, dar nu îndeplinește obiectivul declarat.
Merită bugetat un designer măcar pentru S1 și S3.

## Definition of done

Nicio culoare hardcodată. Nicio imagine neoptimizată. Portalul acoperă tot ce interesează un
părinte. Verificările de accesibilitate trec în CI.

## Decizii luate

**Logo-ul există; paleta, tipografia și restul sistemului se definesc pornind de la el.**

În repo se găsesc `apps/api/src/assets/logo.png` la 500×500 și setul de favicon-uri din
`apps/web/public/`, cel mai mare fiind 512×512. Suficient pentru ecran, **insuficient
pentru tipar sau pentru afișare mare** — un banner sau un certificat din
[E13](E13-progres-evaluare.md) va arăta pixelat.

Primul pas din S1 e deci obținerea unui **logo vectorial** (SVG sau, în lipsă, PDF sau AI). Dacă
nu mai există fișierul sursă, redesenarea lui vectorială pornind de la PNG e o jumătate de zi de
lucru și merită făcută o singură dată, acum.

Din logo se derivă paleta primară și accentele; tipografia se alege separat, ca să susțină
echilibrul dintre „e pentru copii” și „e o școală serioasă” descris în S1.

## Întrebări deschise

- Se aduce un designer, sau se merge pe un sistem existent adaptat?
- Portalul e și aplicație instalabilă pe telefon? Nu pentru proiecte —
  [E14](E14-proiecte-elevi.md) a evaluat varianta aplicației instalabile și a respins-o, fiindcă
  adăuga un gest profesorului. Întrebarea rămâne pentru portalul părintelui: notificări și acces
  rapid la orar, prezență și facturi.

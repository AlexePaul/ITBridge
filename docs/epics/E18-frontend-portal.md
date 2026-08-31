# E18 · Frontend: design system și portal părinte

**Status:** în lucru · **Pistă:** Public · **Depinde de:** E03 · **Blochează:** E19, E20

**Livrate:** S1 (fundația de design) și S3 (paginile publice). S2 e livrat parțial — greutatea
imaginilor e rezolvată, pipeline-ul nu. **Rămân:** S4, S5, S6, S7, toate după autentificare sau în
CI. S4 și S5 nu se pot demonstra până nu rulează un backend — vezi [E01](E01-infrastructura-medii.md), S4.

> ## Cerut de școală: rescrierea întregii zone de după login
>
> **Tot ce e după autentificare arată prost și trebuie refăcut, nu peticit.** Nu e o observație
> despre o pagină anume — e despre toate: cele **4 pagini de portal** și cele **32 de ecrane de
> admin**, inclusiv cele adăugate recent (`/admin/approvals`, `/admin/formare`,
> `/admin/invoices/emitere`).
>
> Motivul e vizibil cu ochiul liber: **paginile publice au fost rescrise pe sistemul din S1, cele
> autentificate nu.** Publicul folosește `classical.css` — paletă proprie, scară tipografică,
> spațiere. Zona autentificată folosește componentele Nuxt UI cu valorile implicite, iar `app.config.ts`
> doar mapează `primary` și `neutral` peste ele. Rezultatul e că un părinte trece de la un site care
> arată ca o școală serioasă la un panou care arată ca un instrument intern — exact în momentul în
> care tocmai a plătit.
>
> Cele 28 de ecrane au fost construite în momente diferite, cu tipare diferite de tabel, filtrare,
> formular, stare goală și mesaj de eroare. De aceea e **rescriere, nu retuș**: cât timp nu există un
> tipar comun, fiecare ecran nou adaugă un al 29-lea dialect. Asta e S5, iar S4 e echivalentul pentru
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
- **Portalul părintelui e sărac.** Trei pagini: `dashboard`, `profile`, `payments`. Un părinte nu
  poate vedea orarul copilului, prezența, proiectele sau progresul — pentru că majoritatea nici nu
  există încă, dar nici structura nu le anticipează. Nerezolvat: **paginile de după autentificare
  nu au fost atinse de rescriere și nu sunt cablate la un backend care rulează.**
- **Zona de admin e inconsecventă.** 25 de pagini construite în momente diferite, cu tipare
  diferite de tabel, filtrare, formular și mesaj de eroare. Nerezolvat.
- **Accesibilitate neverificată.** Rezolvat parțial: pe paginile publice contrastul e conform AA
  (butoanele și legăturile folosesc `--color-accent-ink`, marginile de control un token separat la
  3:1), există legătură „Sari la conținut”, erorile de formular sunt legate prin `aria-describedby`
  și carusel are rol și etichete. **Verificarea automată din CI nu există** — S6.
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

| | Total |
| --- | --- |
| Originale, servite brut | **1056 KB** |
| JPEG redimensionat | 373 KB |
| AVIF | 347 KB |
| **WebP** | **239 KB** |

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

### S4 · Portalul părintelui — muncă viitoare, blocat

De la trei pagini la un portal complet: privire de ansamblu pe copil, orar, prezență și recuperări,
proiecte, progres, facturi și plăți, profil și preferințe de comunicare.

Construit ca structură acum, populat pe măsură ce epic-urile de domeniu livrează. Secțiunile fără
date încă spun asta explicit, nu rămân goale.

**Acceptanță:** un părinte cu doi copii comută între ei fără să se piardă.

**Neînceput, blocat, și cerut explicit de școală.** Cele trei pagini vechi (`dashboard`, `profile`,
`payments`) există neatinse, pe layout-ul `dashboard`, nerescrise pe sistemul din S1 — iar contrastul
cu paginile publice, care *au* fost rescrise, e primul lucru pe care îl vede un părinte după ce se
autentifică. Blocajul nu e de design, ci de
infrastructură: **backend-ul nu e deployat**, deci nimic din ce e după login nu vorbește cu un API
care rulează. Un portal care nu poate fi nici testat pe date reale, nici arătat cuiva, se rescrie
degeaba. Ordinea corectă e [E01](E01-infrastructura-medii.md) S4 înainte de S4 de aici.

Până atunci, paginile autentificate poartă `noindex, nofollow` din layout-ul `dashboard`, iar
`/admin/` și `/user/` sunt excluse din `robots.txt` — deci starea lor neterminată nu ajunge în
index și nu strică ce s-a câștigat în [E19](E19-seo-geo.md).

### S5 · Uniformizarea zonei de admin — muncă viitoare, **cerută explicit**

Un tipar unic de tabel — sortare, filtrare, paginare, acțiuni în masă, stare goală. Un tipar unic de
formular, cu validare și erori. Toate paginile aliniate. Selectorul de locație din
[E08](E08-multi-locatie.md) integrat în antet.

**Nu mai sunt 25 de pagini, ci 32**, iar numărul crește cu fiecare epic livrat: E11 a adăugat
`/admin/approvals` și `/admin/formare`, E15 a adăugat `/admin/invoices/emitere`. Fiecare a fost
construit cu tiparele pe care le-a găsit, adică fiecare a mai adăugat un dialect. **Costul crește cu
întârzierea**, ceea ce e argumentul pentru care jumătatea de componente merită făcută înainte de
deploy, nu după.

**Acceptanță:** o pagină nouă de admin se construiește din componente existente, fără CSS nou.

**Livrat parțial: jumătatea de componente** — cea care nu cere un API care rulează. Înaintea
oricărui cod s-a făcut un catalog al dialectelor pe toate cele 28 de ecrane: **7 feluri de tabel**
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

**Rămân pentru S5b** — migrarea celor 32 de ecrane, planificată de catalog: salvarea de la v2 a
celor două formulare, măturarea de limbă (dropdown-uri în engleză, „No data"), `AdminDateField`
(izolarea hack-ului fragil de popover din children/edit), bara de filtre (trei forme incompatibile
azi — se extrage după ce migrarea arată care supraviețuiește) și grila de carduri (cinci ecrane,
patru semantici; înainte de orice partajare, `GroupCard` trebuie mutat pe `occupancyOf` — D7).

### S6 · Accesibilitate — livrat parțial

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

**Ce rămâne:** verificarea automată din CI, care e jumătatea care ține rezultatul în timp. Fără ea,
nimic nu împiedică următoarea componentă să reintroducă un contrast de 3:1. Și zona autentificată,
neverificată deloc — se face odată cu S4 și S5.

### S7 · Interfața profesorului — muncă viitoare

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

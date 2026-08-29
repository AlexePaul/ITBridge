# E18 · Frontend: design system și portal părinte

**Status:** în lucru · **Pistă:** Public · **Depinde de:** E03 · **Blochează:** E19, E20

**Livrate:** S1 (fundația de design) și S3 (paginile publice). S2 e livrat parțial — greutatea
imaginilor e rezolvată, pipeline-ul nu. **Rămân:** S4, S5, S6, S7, toate după autentificare sau în
CI. S4 și S5 nu se pot demonstra până nu rulează un backend — vezi [E01](E01-infrastructura-medii.md), S4.

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

### S2 · Pipeline de imagini — livrat parțial

`@nuxt/image` instalat și folosit peste tot. Formate moderne, dimensiuni responsive, încărcare
întârziată sub prima vizualizare, dimensiuni explicite ca să nu sară layout-ul. Fișierele `-old`
șterse.

**Acceptanță:** nicio imagine peste 200KB pe conexiune obișnuită. Deplasarea cumulativă a
layout-ului sub 0.1.

**Ce e făcut:** fișierele `-old` și `laptop.png` șterse; toate cele zece fotografii sunt sub 200KB
(cea mai mare 178KB, 1,1MB în total); `width` și `height` explicite peste tot, deci fără salt de
layout; `loading="lazy"` sub prima vizualizare; caruselul de pe prima pagină încarcă doar cadrul
curent și vecinii lui.

**Ce rămâne:** `@nuxt/image` nu e instalat, deci nu există nici `srcset`, nici WebP/AVIF, nici
redimensionare la cerere. Cele zece JPEG-uri ar coborî la ~670KB la calitate echivalentă. Merită
făcut împreună cu S5 din [E19](E19-seo-geo.md), nu separat.

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

**Neînceput, și blocat.** Cele trei pagini vechi (`dashboard`, `profile`, `payments`) există
neatinse, pe layout-ul `dashboard`, nerescrise pe sistemul din S1. Blocajul nu e de design, ci de
infrastructură: **backend-ul nu e deployat**, deci nimic din ce e după login nu vorbește cu un API
care rulează. Un portal care nu poate fi nici testat pe date reale, nici arătat cuiva, se rescrie
degeaba. Ordinea corectă e [E01](E01-infrastructura-medii.md) S4 înainte de S4 de aici.

Până atunci, paginile autentificate poartă `noindex, nofollow` din layout-ul `dashboard`, iar
`/admin/` și `/user/` sunt excluse din `robots.txt` — deci starea lor neterminată nu ajunge în
index și nu strică ce s-a câștigat în [E19](E19-seo-geo.md).

### S5 · Uniformizarea zonei de admin — muncă viitoare

Un tipar unic de tabel — sortare, filtrare, paginare, acțiuni în masă, stare goală. Un tipar unic de
formular, cu validare și erori. Toate cele 25 de pagini aliniate. Selectorul de locație din
[E08](E08-multi-locatie.md) integrat în antet.

**Acceptanță:** o pagină nouă de admin se construiește din componente existente, fără CSS nou.

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
de trimitere din [E17](E17-comunicare-notificari.md) S9. Alea sunt **ecrane de admin, la birou** —
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

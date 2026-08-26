# E18 · Frontend: design system și portal părinte

**Status:** propus · **Pistă:** Public · **Depinde de:** E03 · **Blochează:** E19, E20

## Problemă

Frontend-ul funcționează, dar arată ca un proiect intern, iar obiectivul declarat e opusul: să se
vadă din prima că școala predă serios.

Ce e concret în neregulă:

- **Fără sistem de design.** @nuxt/ui 4 e instalat, dar folosit cu valorile implicite. Nu există
  identitate: nici paletă proprie, nici scară tipografică, nici spațiere consecventă.
  `app.config.ts` e minimal.
- **Imagini nepregătite.** `public/images/laptop.png` are 1.9MB, `02.jpeg` are 844KB, `01.jpg` are
  326KB — servite brut, la dimensiune completă, fără format modern și fără dimensiuni responsive.
  `@nuxt/image` nu e instalat. E cea mai mare problemă de performanță a site-ului și lovește direct
  în [E19](E19-seo-geo.md). Există și fișiere `02-old.jpeg`, `03-old.jpeg` rămase în repo.
- **Portalul părintelui e sărac.** Trei pagini: `dashboard`, `profile`, `payments`. Un părinte nu
  poate vedea orarul copilului, prezența, proiectele sau progresul — pentru că majoritatea nici nu
  există încă, dar nici structura nu le anticipează.
- **Zona de admin e inconsecventă.** 25 de pagini construite în momente diferite, cu tipare
  diferite de tabel, filtrare, formular și mesaj de eroare.
- **Accesibilitate neverificată.** Nici contrast, nici navigare din tastatură, nici etichete.
- **Fără stări de încărcare și eroare coerente.** `NotificationContainer` există; nu e clar că e
  folosit consecvent.
- **Fără mod întunecat**, deși @nuxt/ui îl suportă din start.

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

### S1 · Fundația de design

Paletă, scară tipografică, spațiere, raze, umbre, mișcare — definite ca token-uri în
`app.config.ts` și în tema Tailwind. Mod întunecat din start, nu adăugat ulterior.

Identitatea trebuie să comunice două lucruri simultan: e pentru copii, deci caldă și jucăușă; și e
o școală serioasă, deci în care un părinte are încredere. Echilibrul dintre ele e decizia de design
centrală a acestui epic.

**Acceptanță:** nicio culoare și nicio dimensiune de font scrise direct într-o componentă.

### S2 · Pipeline de imagini

`@nuxt/image` instalat și folosit peste tot. Formate moderne, dimensiuni responsive, încărcare
întârziată sub prima vizualizare, dimensiuni explicite ca să nu sară layout-ul. Fișierele `-old`
șterse.

**Acceptanță:** nicio imagine peste 200KB pe conexiune obișnuită. Deplasarea cumulativă a
layout-ului sub 0.1.

### S3 · Paginile publice

`index`, `courses`, `about`, `contact` rescrise pe noul sistem. Pagina de cursuri se alimentează din
catalogul din [E10](E10-curriculum-module.md), nu din text scris de mână. Contact și "despre" arată
ambele locații, după [E08](E08-multi-locatie.md).

Fiecare pagină are un apel clar la acțiune care duce la lecția de probă din
[E20](E20-achizitie-lead.md).

**Acceptanță:** un părinte care nu știe nimic despre școală înțelege în 30 de secunde ce se predă,
cui, unde și cât costă.

### S4 · Portalul părintelui

De la trei pagini la un portal complet: privire de ansamblu pe copil, orar, prezență și recuperări,
proiecte, progres, facturi și plăți, profil și preferințe de comunicare.

Construit ca structură acum, populat pe măsură ce epic-urile de domeniu livrează. Secțiunile fără
date încă spun asta explicit, nu rămân goale.

**Acceptanță:** un părinte cu doi copii comută între ei fără să se piardă.

### S5 · Uniformizarea zonei de admin

Un tipar unic de tabel — sortare, filtrare, paginare, acțiuni în masă, stare goală. Un tipar unic de
formular, cu validare și erori. Toate cele 25 de pagini aliniate. Selectorul de locație din
[E08](E08-multi-locatie.md) integrat în antet.

**Acceptanță:** o pagină nouă de admin se construiește din componente existente, fără CSS nou.

### S6 · Accesibilitate

Contrast conform WCAG AA, navigare completă din tastatură, focus vizibil, etichete și roluri ARIA,
text alternativ pe imagini semnificative. Verificare automată în CI.

**Acceptanță:** verificarea automată trece pe toate paginile publice și pe portal. Un flux complet
de autentificare se parcurge doar din tastatură.

### S7 · Interfața profesorului

Ecranele din [E12](E12-prezenta-orar.md) și [E14](E14-proiecte-elevi.md) sunt folosite în picioare,
într-o sală, de pe telefon. Ținte de atingere mari, contrast bun, funcționale pe conexiune slabă.

**Acceptanță:** un profesor marchează prezența și încarcă un proiect de pe telefon, fără să
mărească pagina.

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

În repo se găsesc `it-bridge-backend/src/assets/logo.png` la 500×500 și setul de favicon-uri din
`it-bridge-frontend/public/`, cel mai mare fiind 512×512. Suficient pentru ecran, **insuficient
pentru tipar sau pentru afișare mare** — un banner sau un certificat din
[E13](E13-progres-evaluare.md) va arăta pixelat.

Primul pas din S1 e deci obținerea unui **logo vectorial** (SVG sau, în lipsă, PDF sau AI). Dacă
nu mai există fișierul sursă, redesenarea lui vectorială pornind de la PNG e o jumătate de zi de
lucru și merită făcută o singură dată, acum.

Din logo se derivă paleta primară și accentele; tipografia se alege separat, ca să susțină
echilibrul dintre „e pentru copii" și „e o școală serioasă" descris în S1.

## Întrebări deschise

- Se aduce un designer, sau se merge pe un sistem existent adaptat?
- Portalul e și aplicație instalabilă pe telefon? Ar ajuta la [E14](E14-proiecte-elevi.md).

# E14 · Proiectele elevilor

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E07, E08, E17 · **Blochează:** E19

## Problemă

Copiii construiesc lucruri la fiecare curs. Nimic din ce construiesc nu ajunge la părinți, decât
dacă profesorul își amintește să trimită ceva manual.

E cea mai mare pierdere de valoare din tot sistemul. Proiectul e singura dovadă concretă că lecția
a avut loc și a produs ceva. Fără el, părintele plătește pentru o afirmație.

Astăzi proiectele rămân pe calculatorul din laborator pe care a lucrat copilul. Nu există model de
date, nu există stocare, nu există livrare. Infrastructura de S3 există și funcționează —
`s3.service.ts` cu `uploadFile` și `downloadFile` — dar e folosită doar pentru facturi.

Problema reală nu e stocarea. E **fricțiunea de încărcare.** Orice soluție care cere profesorului
mai mult de câteva secunde per copil nu va fi folosită după prima săptămână.

## Rezultat

Proiectul unui copil ajunge la părinte automat, în ziua cursului. Profesorul îl încarcă în câteva
secunde, de pe calculatorul pe care a lucrat copilul, fără să mute fișiere și fără să caute prin
liste.

## În scop

- Model de date pentru proiecte, cu versiuni.
- Uploader cu fricțiune minimă, conștient de context.
- Livrare automată către părinte.
- Galerie în portalul părintelui.
- Vitrină publică, cu consimțământ.

## În afara scopului

- Evaluarea proiectului — vezi [E13](E13-progres-evaluare.md).
- Editor sau mediu de rulare în browser. Proiectele se păstrează și se descarcă, nu se execută.

## Story-uri

### S1 · Modelul de proiect

`Project`: copil, ședință din [E12](E12-prezenta-orar.md), modul, lecție, titlu, descriere, fișiere,
miniatură, dată, autor al încărcării, stare de consimțământ pentru publicare.

Fișierele în S3, cu tipuri așteptate: `.sb3` de la Scratch, capturi de ecran, video, arhive, cod.
Versiuni multiple pe același proiect, pentru că un copil revine la ce a făcut săptămâna trecută.

**Acceptanță:** un proiect are unul sau mai multe fișiere, e legat de o ședință concretă, și știe
dacă are voie să fie publicat.

### S2 · Uploaderul

Aici e miezul epicului, și merită argumentat, pentru că soluția evidentă nu e cea mai bună.

**Ideea inițială — script de click dreapta pe Windows** — funcționează, dar are costuri ascunse:
instalare în registry pe fiecare calculator, actualizări manuale, credențiale stocate local,
dependență de un singur sistem de operare, și tot rămâne de căutat copilul într-o listă.

**Propunerea alternativă pleacă de la o observație: sistemul știe deja cine e în sală acum.** Ai
grupe cu zi și oră din [E08](E08-multi-locatie.md), ai prezența din [E12](E12-prezenta-orar.md), ai
sala și calculatoarele din ea.

Deci: fiecare calculator din laborator se înregistrează o dată ca `Device`, legat de o sală, cu un
token de lungă durată. Pe desktop stă o aplicație web instalată ca PWA. Când o deschizi, întreabă
backend-ul *cine e în sesiune pe device-ul ăsta, acum*, și primește copiii din grupa programată în
acea sală, în acel interval, ordonați după cine e marcat prezent. Profesorul trage fișierul peste
pagină și apasă pe copil. De obicei un singur tap, fără căutare, fără tastare.

Ce câștigă față de scriptul nativ: zero instalare reală, orice sistem de operare, se actualizează
singur, merge și de pe telefonul profesorului — ceea ce contează mai mult decât pare, pentru că
jumătate dintre proiectele unei școli de IT pentru copii sunt un robot sau o construcție fizică pe
care o fotografiezi, nu un fișier.

Scriptul de click dreapta rămâne o extensie opțională peste asta, dacă profesorii chiar o cer după
ce folosesc PWA-ul o lună. Construit al doilea, nu primul.

**Acceptanță:** de la fișier pe ecran la proiect încărcat și atribuit copilului corect, în sub zece
secunde, fără tastare.

### S3 · Miniaturi și previzualizare

Miniatură generată automat: cadru din video, prima imagine dintr-o arhivă, captură pentru cod. Un
email cu o miniatură reală e altceva decât un email cu un link.

Pentru `.sb3` merită investigat dacă se poate extrage imaginea de scenă din arhivă — e un ZIP cu
`project.json` și resurse.

**Acceptanță:** peste 80% dintre proiectele încărcate au miniatură automată.

### S4 · Livrare către părinte

În seara cursului, un singur email per părinte, cu toate proiectele copiilor din acea zi: miniatură,
titlu, ce s-a învățat — legat de lecția din [E10](E10-curriculum-module.md) — și link către portal.
Un email per copil per proiect ar fi spam; unul pe zi e un ritual așteptat.

Prin [E17](E17-comunicare-notificari.md), cu preferință de frecvență: imediat, zilnic sau săptămânal.

**Acceptanță:** un părinte cu doi copii care au avut curs în aceeași zi primește **un** email, cu
ambele.

### S5 · Galeria din portal

Fiecare copil are o pagină cu tot ce a construit, în ordine cronologică, filtrabilă pe modul.
Descărcabilă integral — e munca copilului, părintele trebuie să o poată lua cu el.

**Acceptanță:** un părinte descarcă arhiva completă a proiectelor copilului dintr-un singur loc.

### S6 · Vitrina publică

Proiectele cu consimțământ explicit din [E07](E07-securitate-gdpr.md) apar pe o pagină publică:
prenume și inițială, vârstă, modul, ce a construit.

E cel mai puternic material de marketing pe care îl poate avea școala, pentru că e singurul care nu
poate fi inventat. Alimentează direct [E19](E19-seo-geo.md): conținut proaspăt, specific, exact
genul de material concret pe care motoarele generative îl citează.

Retragerea consimțământului scoate proiectul de pe site automat, fără intervenție manuală.

**Acceptanță:** niciun proiect fără consimțământ activ nu e vizibil public. Revocarea are efect în
sub un minut.

## Dependențe

[E07](E07-securitate-gdpr.md) pentru consimțământ — **obligatoriu înainte**, nu după.
[E08](E08-multi-locatie.md) pentru sală și device. [E17](E17-comunicare-notificari.md) pentru livrare.

## Riscuri

**Fricțiunea de încărcare decide dacă epicul reușește sau eșuează.** Totul depinde de S2. Merită
testat cu profesorii pe hârtie înainte de a scrie cod, și măsurat după lansare: dacă rata de
încărcare scade sub 70% din ședințe, uploaderul e greșit, nu profesorii.

**Datele copiilor pe stocare publică sunt un risc real.** Bucket-ul S3 nu are voie să fie public.
Accesul se face prin URL-uri semnate, cu termen scurt, verificate în backend.

**Token de device pe un calculator din laborator e o credențială expusă.** Trebuie limitat la
încărcare, legat de sală, revocabil, și fără drept de citire a altor date.

## Definition of done

Peste 80% dintre ședințe au cel puțin un proiect încărcat. Părinții primesc automat. Vitrina publică
are proiecte reale, cu consimțământ.

## Întrebări deschise

- **Ce încarcă profesorii, concret?** Merită o zi de observație într-un curs real înainte de a
  proiecta uploaderul. Răspunsul schimbă totul.
- Câte calculatoare sunt per sală, și rulează Windows?
- Vor părinții să vadă proiectele altor copii din grupă? Ar fi motivant, dar cere consimțământ
  suplimentar.

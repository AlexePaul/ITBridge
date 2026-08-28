# E14 · Proiectele elevilor

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E07, E08, E09, E10, E12, E17 · **Blochează:** E19

## Problemă

Copiii construiesc lucruri la fiecare curs. Nimic din ce construiesc nu ajunge la părinți, decât
dacă profesorul își amintește să trimită ceva manual.

E cea mai mare pierdere de valoare din tot sistemul. Proiectul e singura dovadă concretă că lecția
a avut loc și a produs ceva. Fără el, părintele plătește pentru o afirmație.

Astăzi proiectele rămân pe calculatorul din laborator pe care a lucrat copilul. Nu există model de
date, nu există stocare, nu există livrare. Există un client S3 funcțional —
`apps/api/src/modules/invoice/s3.service.ts` — dar scris pentru un singur tip de fișier:
`uploadFile` fixează `ContentType: 'application/pdf'` (`s3.service.ts:52`) și primește tot fișierul
ca `Buffer`, iar în tot `apps/api/src` nu există ștergere de obiect, `HeadObject`, URL semnat sau
încărcare multipart. Un `.sb3` sau un JPEG urcat prin el azi ar fi stocat etichetat PDF. S3Service
trebuie generalizat și, cel mai probabil, mutat din modulul de facturi într-un modul de stocare.

Nici drumul de intrare nu există: nu există niciun endpoint de încărcare de fișier în backend, deci
nu există nici limită de dimensiune, nici listă de tipuri acceptate.

Problema reală nu e stocarea. E **fricțiunea de încărcare.** Orice soluție care cere profesorului
mai mult de câteva secunde per copil nu va fi folosită după prima săptămână.

## Rezultat

Proiectul unui copil ajunge la părinte automat, în ziua cursului. Profesorul îl încarcă în câteva
secunde, din browser, de pe calculatorul din laborator sau de pe telefon, autentificat cu propriul
cont, fără să mute fișiere și fără să caute prin liste.

## În scop

- Model de date pentru proiecte, cu versiuni.
- Uploader cu fricțiune minimă, conștient de context.
- Livrare automată către părinte.
- Galerie în portalul părintelui.
- Vitrină publică, cu consimțământ.
- Corectarea unei atribuiri greșite.

## În afara scopului

- Evaluarea proiectului — vezi [E13](E13-progres-evaluare.md).
- Editor sau mediu de rulare în browser. Proiectele se păstrează și se descarcă, nu se execută.
- Registru de device-uri pentru calculatoarele din laborator — vezi [Decizii luate](#decizii-luate).
- Coautorat pe același proiect — vezi [Decizii luate](#decizii-luate).
- Încărcare pe bucăți cu reluare de unde a rămas, și coadă locală care supraviețuiește unui refresh
  de pagină. La fișiere de câțiva MB, reîncercarea întreagă e mai ieftină decât mecanismul.

## Story-uri

### S1 · Modelul de proiect

`Project`: copil, ședință din [E12](E12-prezenta-orar.md), modul și lecție din
[E10](E10-curriculum-module.md), titlu, descriere, fișiere, linkuri, miniatură, dată, autor al
încărcării — contul de profesor din [E09](E09-personal-roluri.md) — și un instantaneu al stării de
consimțământ pentru publicare.

**Un proiect are fișiere, linkuri, sau amândouă.** Un link e un URL cu etichetă. Catalogul din
`apps/web/shared/courses.ts` pune Tinkercad și Canva la Clasa 0–2, cel mai tânăr grup, iar la Clasa
5–6 apar primele pagini web: acolo munca copilului *e* linkul, nu un fișier de exportat. Un model
care cere fișier obligatoriu exclude exact grupele de început.

Fișierele în S3, cu tipuri așteptate: `.sb3` de la Scratch, capturi de ecran, video, arhive, cod.
Versiuni multiple pe același proiect, pentru că un copil revine la ce a făcut săptămâna trecută.

**Cheia de obiect e `projects/{projectId}/{versionId}/{fileId}` — numai identificatori, niciodată
numele copilului.** Repo-ul a plătit deja lecția asta pe facturi: comentariul de pe `invoicePdfKey`
(`apps/api/src/modules/invoice/invoice.service.ts:16`) documentează cum numele părintelui pus în
cheie a făcut inaccesibile toate facturile lui la prima redenumire. Aici ar fi în plus și o
scurgere, fiindcă cheia ajunge în URL-uri semnate și în loguri. Fișierele stau în bucket-ul
existent `AWS_S3_BUCKET`, sub prefixul `projects/`, lângă `invoices/`.

**Limite, pentru că azi nu există niciuna.** Listă albă de extensii **și verificarea tipului real
prin magic bytes, nu prin extensie**; maxim ~25MB per fișier pentru `.sb3`, imagini, cod și arhive;
~200MB pentru video. Un fișier respins arată profesorului pe loc ce nu s-a acceptat și de ce.
Cifrele se fixează după ziua de observație din Întrebări deschise — sunt un ordin de mărime, nu o
politică.

**Consimțământul de pe `Project` e un instantaneu pentru viteză de afișare, nu sursa de adevăr.**
Sursa e înregistrarea de consimțământ din [E07](E07-securitate-gdpr.md) S2, pe
`(Profile, Child, scop)`: un proiect e public doar dacă există consimțământ activ pentru acel copil
și acel scop **la momentul afișării**. Fără regula asta, două locuri ar ține același fapt fără
precedență între ele, iar o revocare ar lăsa în urmă rânduri care încă spun „da".

**Acceptanță:** un proiect are cel puțin un fișier **sau** un link, e legat de o ședință concretă,
și nu poate deveni public decât dacă interogarea de consimțământ pentru copilul lui răspunde
afirmativ în momentul afișării.

### S2 · Uploaderul

Aici e miezul epicului, și merită argumentat, pentru că soluția evidentă nu e cea mai bună.

**Ideea inițială — script de click dreapta pe Windows** — funcționează, dar are costuri ascunse:
instalare în registry pe fiecare calculator, actualizări manuale, credențiale stocate local,
dependență de un singur sistem de operare, și tot rămâne de căutat copilul într-o listă.

**Propunerea alternativă pleacă de la o observație: sistemul știe deja cine e în sală acum.** Ai
grupe cu zi, oră și sală din [E08](E08-multi-locatie.md), ai prezența din
[E12](E12-prezenta-orar.md), și ai profesorul pe grupă din [E09](E09-personal-roluri.md).

Deci: profesorul deschide o aplicație web — instalabilă ca PWA, dar fără nimic instalat efectiv — și
se autentifică **cu propriul cont**. Backend-ul răspunde la întrebarea „ce grupă e programată acum
în sala în care predau", din orarul E08 și prezența E12, și întoarce copiii ordonați după cine e
marcat prezent. Profesorul trage fișierul peste pagină și apasă pe copil. De obicei un singur tap,
fără căutare, fără tastare.

Nu există entitate de device și niciun token legat de un calculator: rolul `TEACHER` din
[E09](E09-personal-roluri.md) S2 dă deja acces la „grupele lui: copiii din ele, prezența,
proiectele", iar S4 din același epic promite ecranul cu grupele de azi, sala și copiii. Zero
entități noi, și merge identic de pe telefonul profesorului — vezi
[Decizii luate](#decizii-luate) pentru de ce nu un registru de device-uri.

Ce câștigă față de scriptul nativ: zero instalare reală, orice sistem de operare, se actualizează
singur, merge și de pe telefon — ceea ce contează mai mult decât pare, pentru că o parte din ce
produc copiii nu e un fișier de exportat. O machetă Tinkercad, un design Canva, o pagină web sau un
proiect Scratch partajat online se fotografiază de pe ecran sau se lipesc ca link.

Scriptul de click dreapta rămâne o extensie opțională peste asta, dacă profesorii chiar o cer după
ce folosesc PWA-ul o lună. Construit al doilea, nu primul.

**Video și orice trece de limita obișnuită urcă direct în S3 prin URL semnat, nu prin backend.**
`uploadFile` ține azi tot fișierul în memorie, iar API-ul împarte instanța cu Postgres — un upload
buferat de 200MB nu e lent, e fatal pentru procesul care ține și baza de date. Nu e o limită, e o
decizie de arhitectură care schimbă cum se construiește acest story.

**Rețeaua proastă e cazul normal, nu excepția.** [E12](E12-prezenta-orar.md) S6 promite explicit
„reține local dacă pică rețeaua" pentru un payload de o mie de ori mai mic, iar tiparul ăsta de eșec
s-a întâmplat deja pe aplicația reală: [E04](E04-migrari-date.md) documentează un upload S3 picat la
mijloc, rândul rămas în baza de date și reîncercarea căzând pe o constrângere de unicitate,
„reprodus și confirmat". Deci: stare per fișier, nu per lot, cu reîncercare explicită; **cheie de
idempotență pe fiecare încărcare**, aceeași disciplină ca la emiterea din [E16](E16-plati-fiscal.md)
S2, ca o reîncercare să nu producă al doilea proiect și, în aceeași seară, a doua miniatură în
emailul părintelui; fotografiile se redimensionează pe client înainte de trimitere.

**Fotografia se face asupra lucrării, nu asupra copilului.** Uploaderul scrie asta pe ecran și
adaugă: dacă în cadru intră alți copii, se decupează sau se reface. Uploaderul știe deja cine e în
sesiune, deci marchează vizibil copiii fără acord de imagine — scopul de fotografiere din
[E07](E07-securitate-gdpr.md) S2. Livrarea proiectului propriu către propriul părinte nu depinde de
acel acord; publicarea și fotografierea, da.

**Acceptanță:** de la fișier pe ecran la proiect încărcat și atribuit copilului corect, în sub zece
secunde, fără tastare. O încărcare întreruptă și reîncercată produce un singur proiect, iar
profesorul vede care fișier a eșuat, nu doar că „ceva" a eșuat.

### S3a · Miniatură pentru imagini

Prima livrare, în proces: miniatură pentru capturi de ecran și fotografii, adică pentru majoritatea
a ce se încarcă. Redimensionarea are timeout și limită de dimensiune la intrare; dacă le depășește,
proiectul rămâne fără miniatură și **nu blochează încărcarea**. Un email cu o miniatură reală e
altceva decât un email cu un link, dar un proiect fără miniatură e mult mai bun decât un proiect
neîncărcat.

**Acceptanță:** peste 90% dintre proiectele cu cel puțin o imagine au miniatură automată. Un fișier
care depășește timeout-ul se încarcă oricum.

### S3b · Miniaturi pentru video și `.sb3`

Cadrul din video cere ffmpeg pe host, iar host-ul nu există încă — intră prin
[E01](E01-infrastructura-medii.md) S4, altfel nu are unde rula. Extragerea se face **într-un job
separat, din aceeași coadă ca emailurile** din [E17](E17-comunicare-notificari.md) S3, nu în
procesul care servește cereri: o extragere sincronă ar bloca event loop-ul la fiecare încărcare.

Pentru `.sb3` nu se știe încă dacă se poate — e un ZIP cu `project.json` și resurse, iar imaginea de
scenă nu e garantat exportabilă. **E un spike cu rezultat propriu**, nu o promisiune de livrare, și
merită făcut întâi: Scratch e oferta de bază la Clasa 3–4 și Clasa 5–6, deci dacă răspunsul e „nu",
miniatura vine dintr-o captură făcută de profesor, iar S2 trebuie să o ceară.

**Acceptanță:** un video încărcat primește miniatură fără să întârzie răspunsul la încărcare.
Spike-ul `.sb3` are un răspuns scris, da sau nu, înainte să se construiască ceva pe el.

### S4 · Livrare către părinte

În seara cursului, un singur email per părinte, cu toate proiectele copiilor din acea zi: miniatură,
titlu, ce s-a învățat — legat de lecția din [E10](E10-curriculum-module.md) — și link către portal.
Un email per copil per proiect ar fi spam; unul pe zi e un ritual așteptat.

**Miniatura se trimite ca atașament inline (CID), nu ca URL semnat**, cu plafon de dimensiune sub
~100KB. Motivul e în [Decizii luate](#decizii-luate).

Prin [E17](E17-comunicare-notificari.md), cu preferință de frecvență: imediat, zilnic sau săptămânal.

**Destinatarul e `Profile.email` al părintelui copilului.** `User` nu are deloc coloană de email, iar
`Profile.email` e `nullable` — înregistrarea cere doar username și parolă. Deci un profil fără
adresă nu primește nimic și apare ca **nelivrat, motiv „fără adresă"**, în evidența din
[E17](E17-comunicare-notificari.md) S5. Nu e sărit tăcut: un părinte care nu primește proiectele nu
primește nici facturile, iar azi nimeni nu ar afla. Adresa devine obligatorie când o probă devine
înscriere activă — regula stă în [E11](E11-inscrieri-capacitate.md), nu aici, fiindcă profilul fără
date de contact e un flux intenționat și nu se strică.

**Acceptanță:** un părinte cu doi copii care au avut curs în aceeași zi primește **un** email, cu
ambele, iar miniaturile se văd și offline, a doua zi dimineața. Un părinte fără adresă apare în
evidența de livrare cu motiv explicit.

### S5 · Galeria din portal

Fiecare copil are o pagină cu tot ce a construit, în ordine cronologică, filtrabilă pe modul.
Descărcabilă integral — e munca copilului, părintele trebuie să o poată lua cu el.

Fișierele se servesc ca atașament, niciodată inline de pe domeniul școlii — vezi
[Decizii luate](#decizii-luate).

**Acceptanță:** un părinte descarcă arhiva completă a proiectelor copilului dintr-un singur loc.

### S6 · Vitrina publică

Proiectele cu consimțământ explicit din [E07](E07-securitate-gdpr.md) apar pe o pagină publică:
prenume și inițială, vârstă, modul, ce a construit.

E cel mai puternic material de marketing pe care îl poate avea școala, pentru că e singurul care nu
poate fi inventat. Alimentează direct [E19](E19-seo-geo.md): conținut proaspăt, specific, exact
genul de material concret pe care motoarele generative îl citează, și e sursa pentru „ce a construit
un copil" din paginile de modul, [E19](E19-seo-geo.md) S4.

**Vitrina se randează pe server la cerere, cu cache scurt.** Retragerea consimțământului invalidează
cache-ul imediat; dacă API-ul nu răspunde, pagina afișează varianta din cache, nu o eroare. Motivul
e în [Decizii luate](#decizii-luate). Consecința de planificare: **S6 nu poate livra înainte de
[E01](E01-infrastructura-medii.md) S4** — e prima pagină publică din tot site-ul care are nevoie de
backend deployat.

Retragerea consimțământului scoate proiectul de pe site automat, fără intervenție manuală.

Înainte ca o fotografie să devină publică, cineva confirmă că în cadru nu apare alt copil
identificabil. Vitrina se revizuiește oricum înainte de publicare — e o bifă în fluxul existent, nu
un flux nou. Fără detecție automată de fețe și fără blurare.

**Acceptanță:** niciun proiect fără consimțământ activ nu e vizibil public. Revocarea are efect în
sub un minut.

### S7 · Corectarea unei atribuiri greșite

Uploaderul e o listă de copii atinsă cu degetul, la sfârșitul orei, în grabă. Cu ~10 locuri pe grupă
(capacitatea implicită din [E08](E08-multi-locatie.md)), greșeala apare în prima lună, iar
consecința nu e o jenă: munca unui copil, cu numele lui, ajunge în inboxul altei familii. E o
divulgare de date personale.

Trei mecanisme, în ordinea valorii:

1. **Fereastra dintre încărcare și emailul de seară e mecanismul principal, și e gratuită.** Cine a
   încărcat poate reatribui sau șterge proiectul până pleacă rezumatul. Cele mai multe greșeli se
   prind chiar în oră.
2. **Adminul șterge și reatribuie oricând**, cu urmă în audit log-ul din
   [E07](E07-securitate-gdpr.md) S3. Dacă emailul a plecat deja, ecranul arată către cine, din
   evidența [E17](E17-comunicare-notificari.md) S5, iar adminul **sună**. Fără flux automat de
   „email de corectare": un al doilea email care spune „ignorați poza primită" atrage atenția asupra
   ei mai mult decât un telefon.
3. **Părintele raportează, nu șterge.** Un link din email și din galerie care trimite o sesizare
   adminului. Motivul e de arhitectură, nu de politețe: lista `PARENT_WRITABLE` din
   `apps/api/src/authorization.spec.ts` enumeră explicit ce poate scrie un părinte, iar matricea de
   autorizare cere rol `ADMIN` pentru orice altă scriere. Un părinte care ar șterge direct un
   `Project` ar cere o excepție nouă în lista aia, exact intenția pe care o apără.

**Acceptanță:** un proiect atribuit greșit se poate muta la copilul corect fără să se reîncarce
fișierul, iar adminul poate răspunde la „a apucat să plece emailul, și către cine?" din interfață.

## Dependențe

[E07](E07-securitate-gdpr.md) pentru consimțământ — **obligatoriu înainte**, nu după. Din el vin
granularitatea `(Profile, Child, scop)`, scopul de fotografiere și audit log-ul din S3.

[E08](E08-multi-locatie.md) pentru sală și orar: uploaderul răspunde la „ce grupă e acum în sala
asta", iar întrebarea nu are răspuns fără sală pe grupă.

[E09](E09-personal-roluri.md) pentru contul și rolul de profesor. `Project` are autor al încărcării,
iar S2 se autentifică sub contul profesorului — fără rolul `TEACHER` nu există cine încarcă.

[E10](E10-curriculum-module.md) pentru modul și lecție în S1, și pentru „ce s-a învățat" din emailul
de seară.

[E12](E12-prezenta-orar.md) pentru ședință — `Project` se leagă de una — și pentru prezența de azi,
care ordonează lista din uploader.

[E17](E17-comunicare-notificari.md) pentru livrare, pentru coada în care rulează S3b, și pentru
evidența de livrări din S5, unde apar părinții fără adresă.

[E01](E01-infrastructura-medii.md) S4 pentru S3b și S6: ffmpeg pe host și un backend deployat.

## Riscuri

**Fricțiunea de încărcare decide dacă epicul reușește sau eșuează.** Totul depinde de S2. Merită
testat cu profesorii pe hârtie înainte de a scrie cod, și măsurat după lansare: dacă rata de
încărcare scade sub 70% din ședințe, uploaderul e greșit, nu profesorii.

**Datele copiilor pe stocare publică sunt un risc real.** Bucket-ul S3 nu are voie să fie public.
Accesul se face prin URL-uri semnate, cu termen scurt, verificate în backend — cu excepția
miniaturii din email, care e atașament tocmai ca să nu existe URL cu viață lungă.

**Fotografia dintr-o sală conține de regulă și alți copii.** E riscul cel mai ușor de subestimat,
fiindcă nu arată ca o problemă tehnică. În România imaginea persoanei e protejată separat de GDPR
(Cod civil, art. 73), iar copilul din fundal are altă familie și alt acord. Contramăsurile sunt în
S2 (avertisment și marcarea copiilor fără acord) și S6 (verificare înainte de publicare), amândouă
umane. Nu există plasă automată.

**Fără antivirus, deocamdată** — consemnat aici ca să nu fie relitigat la fiecare revizie. Motivul e
în [Decizii luate](#decizii-luate); condițiile care redeschid discuția sunt tot acolo.

## Decizii luate

**Fără registru de device-uri; se încarcă sub contul de profesor.** Un registru cu token hash,
coduri de înrolare, rotație, revocare și ecran de admin înseamnă săptămâni de muncă pentru două
cadre didactice, și pune o credențială de lungă durată pe calculatoare la care stau copii — exact
riscul pe care epicul îl marca singur ca fiind cel mai ascuțit. `Device` nu era în scopul niciunui
epic: ideea venea din S2 al acestui epic și din linia lui de dependențe („E08 pentru sală și
device"), nu din [E08](E08-multi-locatie.md), al cărui `În scop` listează doar `Location` și `Room`
și care nu numește nicăieri o entitate de device. Ce are E08 e `Room.computers`, un număr, nu
identități.

**Fără coautorat pe proiect.** Când mai mulți copii lucrează împreună, profesorul atinge mai mulți
copii la aceeași încărcare și se creează câte un proiect pentru fiecare, cu același fișier. Un rând
duplicat e mai ieftin decât o relație mulți-la-mulți cu consimțământ pe intersecție și revocare în
cascadă — la care ar trebui decis, în plus, ce se întâmplă cu proiectul comun când un singur părinte
retrage acordul.

**Un singur bucket, prefix `projects/`; cheia doar din identificatori.** Un al doilea bucket ar
promite izolare pe care nu o încasează nimeni la dimensiunea asta; separarea utilă e cea de prefix,
pe care rolul IAM din [E07](E07-securitate-gdpr.md) S6 o poate restrânge dacă apare cerința. Cheia
fără nume de copil e lecția deja plătită pe facturi (S1).

**Video urcă direct în S3 prin URL semnat, nu prin backend.** `uploadFile` buferează tot fișierul,
iar API-ul rulează pe aceeași instanță cu Postgres. Decizia se ia acum pentru că schimbă forma lui
S2, nu doar o constantă.

**Fișierele se servesc ca atașament** — `Content-Disposition: attachment` plus
`X-Content-Type-Options: nosniff` — niciodată inline de pe domeniul școlii, inclusiv pe vitrina
publică. `nosniff` e deja pus pe tot site-ul din `routeRules` în `apps/web/nuxt.config.ts`; ce se
adaugă e regula de servire din backend. S3Service trebuie oricum modificat, fiindcă hardcodează
`application/pdf`, deci costă o linie acum și o rescriere mai târziu.

**Fără antivirus, deocamdată.** Încarcă doar profesorii, de pe conturi cunoscute, iar fișierele nu
se execută nicăieri — rularea proiectelor e deja în afara scopului. ClamAV ar cere ~1GB rezident pe
instanța care ține și Postgres, plus o stare de „carantină" cu text pentru părinți, pentru o situație
pe care niciun părinte n-o va vedea. Se reia discuția dacă părinții ajung să încarce singuri, sau
dacă vitrina acceptă trimiteri din afara școlii.

**Miniatura din email e atașament inline (CID), sub ~100KB.** Alternativele erau un URL semnat, un
token de imagine de lungă durată sau un prefix public doar pentru miniaturi. Un URL semnat „cu
termen scurt" e o imagine ruptă când părintele deschide mailul a doua zi dimineața — cazul normal
pentru o trimitere de seară — iar SigV4 nu trece de 7 zile nici citit generos. Un token lung
înseamnă că poza unui minor rămâne accesibilă pentru totdeauna dintr-o cutie poștală. Atașamentul
se vede și offline și nu lasă nimic în urmă.

**Vitrina se randează pe server la cerere, cu cache scurt invalidat la revocare.** Generarea la
build nu poate onora „revocarea are efect în sub un minut" — cerință repetată și în
[E07](E07-securitate-gdpr.md) S2 — fără o cale explicită de invalidare, iar `routeRules` din
`apps/web/nuxt.config.ts` nu are azi nici prerender, nici ISR, doar headere și două redirecturi.
Randarea la cerere e singura variantă care ține sub-minutul fără să atingă celelalte șapte pagini
publice, care rămân independente de backend — regula din CLAUDE.md pentru care site-ul stă în
producție deși backend-ul nu e deployat.

## Definition of done

Peste 80% dintre ședințe au cel puțin un proiect încărcat. Părinții cu adresă în sistem primesc
automat; restul apar în evidența de livrare din [E17](E17-comunicare-notificari.md). Vitrina publică
are proiecte reale, cu consimțământ.

## Întrebări deschise

- **Ce încarcă profesorii, concret?** Merită o zi de observație într-un curs real înainte de a
  proiecta uploaderul. Răspunsul schimbă totul, inclusiv limitele de dimensiune din S1 și dacă
  `.sb3` e chiar cazul principal.
- Merită reluat registrul de device-uri? **Recomandare:** doar dacă ziua de observație arată că
  pasul de autentificare costă secundele care decid folosirea. *De confirmat.* Până atunci e muncă
  plătită înainte să se știe dacă rezolvă ceva.
- Un copil are exact un `Profile`, deci proiectele merg la o singură adresă. **Recomandare:** rămâne
  o adresă până cere cineva explicit. *De confirmat.* Un al doilea profil ar duplica copilul și ar
  rupe reducerea de frați, care se numără per familie — o familie cu doi copii ar plăti doi „primi
  copii" întregi. Dacă se cere, soluția e un al doilea câmp de email pe `Profile`, o coloană, și tot
  **un singur email trimis la două adrese**, nu două, care ar contrazice S6 din
  [E17](E17-comunicare-notificari.md).
- Vor părinții să vadă proiectele altor copii din grupă? Ar fi motivant, dar e un scop de
  consimțământ separat, deja prevăzut în [E07](E07-securitate-gdpr.md) S2.

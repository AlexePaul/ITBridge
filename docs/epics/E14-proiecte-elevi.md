# E14 · Proiectele elevilor

**Status:** în lucru — **S1, S2, S3a, S4, S5 și S7 livrate** · **Pistă:** Operațiuni · **Depinde de:** E07, E08, E10, E12, E17 · **Blochează:** E19

**Fluxul de încărcare s-a schimbat, și cu el jumătate din epic.** Nu mai există aplicație web de
încărcat, nici uploader autentificat cu contul profesorului, nici email automat de seară. În locul
lor: un **agent local**, pe un singur calculator Windows din birou, care ține un folder partajat pe
rețea, oglindește în el structura grupe/copii din baza de date, urmărește ce apare acolo și urcă
documentele prin API. Adminul deschide grupa, se uită la documentele noi, bifează și apasă „trimite
email"; fiecare părinte primește doar documentul copilului lui.

Odată cu asta cade și dependența de rolul de profesor: **nu există rol `TEACHER`**, toți cei care se
autentifică sunt admini — vezi [E09](E09-personal-roluri.md). Antetul de mai sus nu mai listează
E09, iar motivul e în [Decizii luate](#decizii-luate).

## Ce s-a livrat

Șase story-uri din opt. Fluxul merge cap la cap: profesorul salvează în folderul copilului, agentul
urcă, adminul se uită pe grupă și apasă, părintele deschide în portal.

- **S1** — `projects`, `project_versions`, `project_files`, `project_links`, plus
  `unassigned_files` și `agent_status`. Cheia de obiect e `projects/{projectId}/{versionId}/{fileId}`
  și e **derivată, nu stocată**: două locuri care spun unde stă un obiect ajung să se contrazică, iar
  contrazicerea e tăcută. `S3Service` s-a generalizat și a ieșit din modulul de facturi în
  `apps/api/src/modules/storage/` — nu mai etichetează totul `application/pdf`, și știe HeadObject,
  ștergere, stream și URL semnat.
- **S2** — `apps/agent`, workspace Node/TypeScript **fără nicio dependență de runtime**: `fetch`,
  `FormData` și `crypto` sunt din Node 22. Oglindește folderele, urcă, mută în `_urcate\<data>`, mută
  ce nu poate atribui în `_neatribuite` și raportează, bate pulsul. Procedura de instalare e în
  [apps/agent/README.md](../../apps/agent/README.md). Ingestia e idempotentă pe `{childId}:{sha256}`,
  cu index unic — o reîncercare după o conexiune căzută nu produce al doilea proiect.
- **S3a** — miniaturi prin `sharp`, cu timeout, plafon la intrare și scară de calitate până sub
  100KB. Eșecul nu blochează încărcarea, niciodată.
- **S4** — butonul de pe grupă. Un click produce N mesaje, fiecare cu **exact un destinatar și exact
  documentele copilului lui**; un părinte cu doi copii primește unul singur. A doua apăsare nu
  trimite nimic. Miniatura pleacă **atașată inline (CID)**, deci `outbox` a primit o coloană
  `attachments` care ține chei, nu octeți.
- **S5** — `/user/proiecte` și `/files/<uuid>`, amândouă după autentificare. Descărcarea unui fișier
  trece prin backend, care verifică filiația și abia apoi semnează un URL cu `attachment`. Arhiva
  întreagă a unui copil se descarcă dintr-un singur loc, streamată.
- **S7** — reatribuire fără reîncărcare, ștergere, și un link de sesizare pentru părinte. Sesizarea e
  singura scriere pe care o poate face un părinte aici, și e un mesaj către birou, nu o schimbare pe
  document.

**Ce nu s-a livrat, și de ce:** S3b are nevoie de ffmpeg pe un host care nu există
([E01](E01-infrastructura-medii.md) S4), iar **S6 are nevoie de consimțământul din
[E07](E07-securitate-gdpr.md) S2, care nu e construit.** Consecința e scrisă în cod: nu există
niciun câmp `isPublic` nicăieri. Un boolean pe `Project` ar fi fost al doilea loc în care se poate
răspunde la aceeași întrebare, fără precedență între ele, iar o revocare ar fi lăsat în urmă rânduri
care încă spun „da". Vitrina așteaptă înregistrarea care o guvernează.

**Întrebarea de teren s-a închis prin decizie, nu prin observație:** unde programul nu poate salva
direct pe drive-ul mapat, profesorul mută fișierul în folderul copilului, iar asta e acceptat. Codul
nu se schimbă — agentul urmărește folderul și nu are de unde ști cum a ajuns fișierul acolo. Ce se
schimbă e argumentul epicului, și merită spus pe față: fluxul nu mai e „zero gesturi" peste tot, ci
„zero gesturi unde se poate, unul mic unde nu". Vezi [Riscuri](#riscuri).

## Problemă

Copiii construiesc lucruri la fiecare curs. Nimic din ce construiesc nu ajunge la părinți, decât
dacă cineva își amintește să trimită ceva manual.

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

Problema reală nu e stocarea. E **fricțiunea de încărcare.** Orice soluție care cere un gest în plus
la sfârșitul orei nu va fi folosită după prima săptămână. Concluzia asta nu s-a schimbat; ce s-a
schimbat e răspunsul. Gestul cel mai ieftin nu e „deschid o pagină și încarc", ci „salvez fișierul
unde îl salvam oricum" — dacă locul ăla e un folder de rețea pe care îl urmărește altcineva.

## Rezultat

Documentul unui copil ajunge la părintele lui, fără ca nimeni să încarce nimic. Profesorul salvează
lucrarea în folderul copilului, din Explorer sau direct din dialogul „Save as" al programului în
care s-a lucrat. Agentul o urcă. Adminul o vede pe grupă, se uită la ea și apasă un buton.

## În scop

- Model de date pentru proiecte, cu versiuni.
- Agentul local și folderul de rețea oglindit după grupe și copii.
- Endpoint de ingestie idempotent în API, plus adăugarea manuală a unui fișier sau a unui link.
- Livrare către părinte, declanșată de admin, pe grupă.
- Galerie în portalul părintelui.
- Vitrină publică a lucrărilor, cu consimțământ.
- Corectarea unei atribuiri greșite.

## În afara scopului

- Evaluarea proiectului — vezi [E13](E13-progres-evaluare.md).
- Editor sau mediu de rulare în browser. Proiectele se păstrează și se descarcă, nu se execută.
- Agent pe fiecare calculator din laborator, registru de device-uri și încărcare de pe telefon — vezi
  [Decizii luate](#decizii-luate).
- Coautorat pe același proiect — vezi [Decizii luate](#decizii-luate).
- Deducerea prezenței din fișierele apărute în foldere — vezi [Decizii luate](#decizii-luate).
- Încărcare pe bucăți, cu reluare de unde a rămas. Agentul reia fișierul întreg: e mai ieftin decât
  mecanismul, și n-are grabă — rulează într-un birou, nu în fața cuiva care așteaptă.

## Story-uri

### S1 · Modelul de proiect

`Project`: copil, ședință din [E12](E12-prezenta-orar.md), modul și lecție din
[E10](E10-curriculum-module.md), titlu, descriere, fișiere, linkuri, miniatură, dată, sursa
încărcării — agentul sau un admin, cu contul care a făcut-o — și un instantaneu al stării de
consimțământ pentru publicare.

**Un proiect are fișiere, linkuri, sau amândouă.** Un link e un URL cu etichetă. Catalogul din
`apps/web/shared/courses.ts` pune Tinkercad și Canva la Clasa 0–2, cel mai tânăr grup, iar la Clasa
5–6 apar primele pagini web: acolo munca copilului _e_ linkul, nu un fișier de exportat. Un model
care cere fișier obligatoriu exclude exact grupele de început — și, în fluxul nou, e singura formă
prin care o lucrare care trăiește online intră în sistem.

Fișierele în S3, cu tipuri așteptate: `.sb3` de la Scratch, capturi de ecran, video, arhive, cod.
Versiuni multiple pe același proiect, pentru că un copil revine la ce a făcut săptămâna trecută.

**Cheia de obiect e `projects/{projectId}/{versionId}/{fileId}` — numai identificatori, niciodată
numele copilului.** Repo-ul a plătit deja lecția asta pe facturi: comentariul de pe `invoicePdfKey`
(`apps/api/src/modules/invoice/invoice.service.ts:15`) documentează cum numele părintelui pus în
cheie a făcut inaccesibile toate facturile lui la prima redenumire. Aici ar fi în plus și o
scurgere, fiindcă cheia ajunge în URL-uri semnate și în loguri. Fișierele stau în bucket-ul
existent `AWS_S3_BUCKET`, sub prefixul `projects/`, lângă `invoices/`.

**Documentul are stare, nu doar existență: `nou`, `trimis`, `eroare`.** Sunt exact cele trei stări
pe care [E17](E17-comunicare-notificari.md) S5 le cere vizibile în lista grupei, și sunt proiecția
outbox-ului înapoi pe document, nu un al doilea adevăr ținut de mână. Fără ele, adminul care revine
a doua zi nu poate distinge ce a trimis deja de ce a apărut între timp.

**Limite, pentru că azi nu există niciuna.** Listă albă de extensii **și verificarea tipului real
prin magic bytes, nu prin extensie**; maxim ~25MB per fișier pentru `.sb3`, imagini, cod și arhive;
~200MB pentru video. Un fișier respins nu dispare: rămâne în folder și apare pe ecranul grupei cu
motivul, ca la orice altă neatribuire din S2. Cifrele se fixează după ziua de observație din
Întrebări deschise — sunt un ordin de mărime, nu o politică.

**Consimțământul de pe `Project` e un instantaneu pentru viteză de afișare, nu sursa de adevăr.**
Sursa e înregistrarea de consimțământ din [E07](E07-securitate-gdpr.md) S2, pe
`(Profile, Child, scop)`: un proiect e public doar dacă există consimțământ activ pentru acel copil
și acel scop **la momentul afișării**. Fără regula asta, două locuri ar ține același fapt fără
precedență între ele, iar o revocare ar lăsa în urmă rânduri care încă spun „da".

**Acceptanță:** un proiect are cel puțin un fișier **sau** un link, e legat de un copil și de o dată
concretă, are una dintre cele trei stări, și nu poate deveni public decât dacă interogarea de
consimțământ pentru copilul lui răspunde afirmativ în momentul afișării.

**Livrat**, cu o abatere de consemnat: **nu există `isPublic` și nici instantaneu de consimțământ pe
`Project`.** Motivul e chiar regula de mai sus. Instantaneul ar fi fost util doar pentru viteza
vitrinei, iar vitrina nu se poate livra fără sursa de adevăr din [E07](E07-securitate-gdpr.md) S2 —
deci un câmp acum ar fi fost o coloană care nu apără nimic și pe care cineva ar fi putut-o citi
cândva ca răspuns. Se adaugă odată cu S6, împreună cu regula de precedență.

Cerința „cel puțin un fișier sau un link" e verificată în serviciu, fiindcă „una dintre două colecții
e nevidă" nu e o constrângere pe care o poate purta o coloană.

### S2 · Agentul local și folderul oglindit

Aici e miezul epicului, și merită argumentat, pentru că soluția evidentă nu e cea mai bună.

**Ce s-a încercat înainte, pe hârtie.** Un script de click dreapta pe Windows: instalare în registry
pe fiecare calculator, actualizări manuale, credențiale locale, un singur sistem de operare. Apoi o
aplicație web instalabilă, deschisă de profesor cu propriul cont, care întreba „ce grupă e acum în
sala asta". A doua e mai curată ca arhitectură și cere totuși, la sfârșitul fiecărei ore, ca cineva
să deschidă o pagină, să se autentifice și să tragă fișiere în ea. Amândouă adaugă un gest. Ce s-a
ales adaugă zero.

**Un folder de rețea, oglindit după baza de date.** Pe calculatoarele din laborator e mapat un drive
de rețea. Structura lui e generată, nu întreținută de mână:

```
P:\Proiecte\<Locație>\<Grupă>\<Copil>\
P:\Proiecte\<Locație>\<Grupă>\_neatribuite\
P:\Proiecte\<Locație>\<Grupă>\<Copil>\_urcate\<data>\
```

Profesorul salvează lucrarea în folderul copilului — din Explorer, sau direct din dialogul de
salvare al programului în care s-a lucrat. Atât. Nu se autentifică nimeni, nu se deschide nimic, nu
se instalează nimic pe calculatorul din laborator. Pe un singur calculator din birou rulează un
serviciu care urmărește folderul, urcă fiecare fișier nou prin API și îl mută în `_urcate\<data>`,
ca profesorul să vadă din Explorer ce a plecat și ce nu.

**De ce un singur calculator, și nu unul pe fiecare mașină din laborator.** Un agent pe fiecare
mașină înseamnă N instalări, N credențiale de lungă durată pe calculatoare la care stau copii, și N
actualizări — exact costul care a scos din discuție scriptul de click dreapta. Unul singur, în
birou, înseamnă o credențială într-o încăpere încuiată și o actualizare. Calculatoarele din laborator
rămân ce sunt: mașini cu un drive mapat.

**Ce costă, spus pe față.** Decizia e bună, nu e gratuită:

- **Punct unic de eșec.** Calculatorul din birou oprit înseamnă zero încărcări. Partea bună e că
  eșecul e blând: fișierele rămân în folder și urcă atunci când agentul revine — partajarea e coada.
  Partea rea e că tăcerea arată identic cu „n-a lucrat nimeni azi". De aceea agentul **bate un puls**
  la fiecare câteva minute, iar ecranul grupei spune „agentul nu a mai raportat de 3 ore". Alertarea
  merge pe canalul din [E06](E06-observabilitate-operare.md) S3, nu pe un al doilea mecanism.
- **Doar Windows, doar în rețeaua școlii.** Acceptat: e calculatorul școlii, în biroul școlii.
- **Nu intră nimic de pe telefon și niciun link.** O machetă Tinkercad, un design Canva sau un
  proiect Scratch partajat online nu sunt fișiere de salvat într-un folder. Din cauza asta modelul
  din S1 acceptă și linkuri, iar aici există două drumuri: un fișier `.url` sau `.txt` cu un link
  în folderul copilului e citit de agent ca proiect-link, iar adminul poate adăuga un link sau un
  fișier direct din ecranul grupei. **Agentul e drumul principal, nu singurul.**

**Oglinda e generată din baza de date și nu e sursa de adevăr.** Agentul creează, redenumește și mută
folderele după grupe și copii, periodic. Două reguli fac diferența dintre o oglindă utilă și una care
pierde fișiere:

1. **Numele de folder conține identificatorul copilului**, nu doar numele lui. Doi copii cu același
   prenume într-o grupă nu sunt o ipoteză, sunt săptămâna a treia; iar un folder redenumit de mână nu
   are voie să orfanizeze fișierele din el. E aceeași lecție ca la cheia de obiect din S1, în alt
   loc: identificatorul e stabil, numele nu.
2. **Un copil e într-o singură grupă**, deci oglinda e un arbore și fiecare fișier are exact un
   drum către un copil. Vezi [Decizii luate](#decizii-luate) — fără regula asta, agentul ar trebui
   să ghicească din care grupă face parte un fișier apărut sub un copil care apare în două locuri.

**Nimic nu se pierde în tăcere.** Un fișier pe care agentul nu îl poate atribui — pus în rădăcina
grupei, într-un folder necunoscut, cu extensie nepermisă sau prea mare — se mută în `_neatribuite` și
apare pe ecranul grupei cu motivul, ca sarcină pentru admin. E aceeași disciplină ca la destinatarii
fără adresă din [E17](E17-comunicare-notificari.md) S5: absența unei atribuiri e o informație, nu un
rând de sărit.

**Agentul se autentifică sub un cont dedicat, cu rol `ADMIN`**, fiindcă alt rol nu există — vezi
[Decizii luate](#decizii-luate). Două lucruri de scris în cod de la început, nu de descoperit în
producție:

- **Rotația refresh tokenului.** `POST /auth/refresh` consumă tokenul prezentat și întoarce altul,
  iar refolosirea unuia consumat revocă tot lanțul, ca semnal de furt. Un serviciu care se
  autentifică o dată și ține tokenul în memorie e exact locul în care reapare bug-ul pe care l-a avut
  `apps/web/app/composables/api/useApi.ts` și care deloga părinții la ~30 de minute. Agentul
  persistă tokenul rotit pe disc, la fiecare reîmprospătare.
- **Cheie de idempotență pe fiecare încărcare**, derivată din conținut, nu din nume. Aceeași
  disciplină ca la emiterea din [E16](E16-plati-fiscal.md) S2. Motivul nu e teoretic:
  [E04](E04-migrari-date.md) documentează un upload S3 picat la mijloc, rândul rămas în baza de date
  și reîncercarea căzând pe o constrângere de unicitate, „reprodus și confirmat". Fără cheie, o
  reîncercare produce al doilea `Project` și, la trimitere, a doua miniatură în emailul părintelui.

**Video și orice trece de limita obișnuită urcă direct în S3 prin URL semnat, nu prin backend.**
`uploadFile` ține azi tot fișierul în memorie, iar API-ul împarte instanța cu Postgres — un upload
buferat de 200MB nu e lent, e fatal pentru procesul care ține și baza de date. Nu e o limită, e o
decizie de arhitectură care schimbă cum se construiește acest story.

**Se fotografiază lucrarea, nu copilul.** Fără fețe, fără copii în cadru, de la bun început — vezi
[Decizii luate](#decizii-luate). Nu e un avertisment pe ecran urmat de verificare, e regula după care
se face poza: cadrul e ecranul, macheta, foaia sau obiectul construit. Regula supraviețuiește
schimbării de flux; ce se schimbă e că acum mai există un om care se uită la imagine înainte să
plece, în S4.

**Acceptanță:** un fișier salvat în folderul unui copil în timpul orei apare pe ecranul grupei, în
starea `nou`, în mai puțin de un minut, fără ca nimeni să se autentifice. O rețea căzută nu pierde
nimic și o reîncercare nu produce două proiecte. Un fișier neatribuibil apare în `_neatribuite` și pe
ecran, cu motiv. Un agent care nu mai raportează e vizibil în interfață și declanșează alertă.

**Livrat**, cu trei precizări:

- **Nu `fs.watch`, ci scanare la 30 de secunde.** Notificările de modificare peste SMB se pierd tăcut,
  nu se întârzie, iar un eveniment pierdut e un fișier care nu urcă niciodată. O parcurgere de
  directoare pe o partajare cu câteva zeci de foldere e ieftină și își revine singură după o pană.
- **Alertarea nu e livrată, vizibilitatea da.** Ecranul spune „agentul nu a mai raportat de 3 ore";
  canalul de alertare e [E06](E06-observabilitate-operare.md) S3 și nu există. Riscul rămâne
  acceptabil fiindcă cifra se vede din interfață, nu fiindcă sună ceva.
- **Drumul pentru fișiere mari există în API, dar agentul nu îl folosește încă.** `POST
/projects/uploads/register` întoarce un URL semnat și `POST /projects/files/:id/complete` confirmă
  că obiectul chiar a ajuns; agentul refuză deocamdată extensiile video la scanare. Video-ul oricum
  n-are ce face fără S3b.

### S3a · Miniatură pentru imagini

Prima livrare, în proces: miniatură pentru capturi de ecran și fotografii, adică pentru majoritatea
a ce se încarcă. Redimensionarea are timeout și limită de dimensiune la intrare; dacă le depășește,
proiectul rămâne fără miniatură și **nu blochează încărcarea**. Un email cu o miniatură reală e
altceva decât un email cu un link, dar un proiect fără miniatură e mult mai bun decât un proiect
neîncărcat.

Miniatura contează mai mult decât înainte: adminul din S4 decide ce pleacă uitându-se la ea. O listă
de nume de fișiere nu e o revizie.

**Acceptanță:** peste 90% dintre proiectele cu cel puțin o imagine au miniatură automată. Un fișier
care depășește timeout-ul se încarcă oricum.

**Livrat.** `sharp`, latura lungă la 480px, JPEG pe o scară de calitate care coboară până când intră
sub 100KB — plafonul vine din S4, unde miniatura pleacă atașată. Rularea e **după commit**, niciodată
înăuntrul lui: o miniatură are voie să eșueze, iar dacă ar eșua în tranzacție ar lua încărcarea cu
ea. Reîncodarea are un efect secundar care merită numit, fiindcă octeții vin de pe o partajare pe
care poate scrie orice mașină din școală: ce iese e o imagine produsă de `sharp`, nu un fișier
primit, deci un poliglot valid și ca imagine și ca altceva nu supraviețuiește drumului.

### S3b · Miniaturi pentru video și `.sb3`

Cadrul din video cere ffmpeg pe host, iar host-ul nu există încă — intră prin
[E01](E01-infrastructura-medii.md) S4, altfel nu are unde rula. Extragerea se face **într-un job
separat, din aceeași coadă ca emailurile** din [E17](E17-comunicare-notificari.md) S3, nu în
procesul care servește cereri: o extragere sincronă ar bloca event loop-ul la fiecare încărcare.

Pentru `.sb3` nu se știe încă dacă se poate — e un ZIP cu `project.json` și resurse, iar imaginea de
scenă nu e garantat exportabilă. **E un spike cu rezultat propriu**, nu o promisiune de livrare, și
merită făcut întâi: Scratch e oferta de bază la Clasa 3–4 și Clasa 5–6, deci dacă răspunsul e „nu",
miniatura vine dintr-o captură salvată de profesor în același folder, lângă `.sb3`.

**Acceptanță:** un video încărcat primește miniatură fără să întârzie ingestia. Spike-ul `.sb3` are
un răspuns scris, da sau nu, înainte să se construiască ceva pe el.

**Nelivrat**, blocat de [E01](E01-infrastructura-medii.md) S4: ffmpeg are nevoie de un host, iar
host-ul nu există. Ce s-a livrat în avans e locul unde intră — `ThumbnailService` are o singură
metodă, `fromImage`, iar un `fromVideo` alături de ea nu atinge nimic din ingestie. Spike-ul `.sb3`
n-a fost făcut și nu trebuie făcut înainte de ffmpeg: dacă răspunsul e „nu", varianta de rezervă e o
captură salvată de profesor lângă `.sb3`, iar aia merge deja azi.

### S4 · Trimiterea către părinte

**Nimic nu pleacă automat.** Adminul deschide grupa, vede documentele noi urcate de agent, bifează ce
se trimite și apasă. Mecanismul e integral în [E17](E17-comunicare-notificari.md) S8; aici se scrie
doar ce înseamnă pentru proiecte.

**De ce un buton și nu un job de seară** e argumentat în E17 S9 și nu se repetă aici. Ce ține de E14
e că revizia chiar e făcută: cu ~10 locuri pe grupă ([E08](E08-multi-locatie.md), și vezi
[Decizii luate](#decizii-luate)), lista la care se uită adminul are zece rânduri, nu o sută. La o
sută, butonul ar deveni o formalitate apăsată în grabă.

**Selecția e pe grupă, dar trimiterea se desface per părinte.** Un click produce N mesaje, fiecare cu
exact un destinatar și exact documentele copilului lui. Un părinte cu doi copii în aceeași trimitere
primește un singur mesaj, cu ambii.

**Destinatarul e exclusiv `Profile.email` al părintelui acelui copil.** Un singur destinatar, nu o
listă: nimic din ce a construit un copil nu ajunge la altă familie, nici ca miniatură, nici ca titlu,
nici ca link. Nu există copie de curtoazie către grupă, către alți părinți sau către o listă a
locației; dacă apare vreodată cerința, e un scop de consimțământ separat, nu o adăugare la acest
email — vezi [Decizii luate](#decizii-luate).

**Miniatura se trimite ca atașament inline (CID), nu ca URL semnat**, cu plafon de dimensiune sub
~100KB. Motivul e în [Decizii luate](#decizii-luate).

`User` nu are deloc coloană de email, iar `Profile.email` e `nullable`
(`apps/api/src/entities/profile.entity.ts:17`). Un profil fără adresă nu primește nimic și apare ca
**nelivrat, motiv „fără adresă"**, în evidența din [E17](E17-comunicare-notificari.md) S5. Nu e sărit
tăcut: un părinte care nu primește documentele nu primește nici facturile, iar azi nimeni nu ar afla.
Cazul rămâne posibil doar pentru profilurile create de admin fără date de contact, care sunt un flux
intenționat și nu se strică.

**Linia „ce s-a învățat" rămâne goală până există programa.** Textul vine din lecția din
[E10](E10-curriculum-module.md), iar programa scrisă poate să nu existe până la finalul vacanței.
Nu blochează nimic: emailul pleacă cu miniatură, titlu și link către portal, iar linia apare când
modulele sunt introduse. Între timp [E10](E10-curriculum-module.md) a ieșit din MVP, deci „când" e
mai departe decât părea — dar consecința e aceeași linie goală, nu un blocaj.

**Consecință pentru [E07](E07-securitate-gdpr.md):** documentul propriului copil către propriul
părinte e o livrare tranzacțională, nu marketing, deci nu se oprește din preferințele de frecvență —
nu pentru că adminul îl declanșează manual, ci pentru că e executarea contractului.

**Acceptanță:** un părinte cu doi copii în aceeași trimitere primește **un** email, cu ambele, iar
miniaturile se văd și offline, a doua zi dimineața. Un părinte fără adresă apare în evidența de
livrare cu motiv explicit. Un test de integrare cu doi părinți reali, cu copii în aceeași grupă,
arată că fiecare email conține doar documentele propriului copil — aceeași disciplină ca suitele de
autorizare din `apps/api/test/`.

**Livrat**, inclusiv testul cerut: `apps/api/test/projects.e2e-spec.ts` pune doi părinți reali cu
copii în aceeași grupă și verifică pe rândurile din `outbox` că mesajul Mariei nu conține nimic al
copilului Elenei — nici titlu, nici link, nici prenume.

Două abateri:

- **Evidența de livrare din [E17](E17-comunicare-notificari.md) S5 nu există**, deci părinții fără
  adresă apar în **raportul trimiterii**, pe ecran, nu într-un registru. Nu dispar tăcut, dar nici nu
  rămân undeva de citit a doua zi. Se mută acolo când S5 se construiește.
- **Coada a învățat să poarte atașamente**, fiindcă altfel miniatura n-avea cum să plece inline.
  `outbox.attachments` ține **chei, nu octeți**: base64 într-o coloană `text` ar fi îngrășat fiecare
  interogare de revendicare pentru date de care e nevoie o singură secundă. Un obiect care lipsește
  între timp nu oprește mesajul — pleacă fără poză.

Un document cu fișiere neîncărcate complet e sărit, cu motiv. E o stare reală, nu o precauție:
drumul cu URL semnat scrie rândul înainte să existe obiectul, iar un link către nimic e mai rău
decât o întârziere.

### S5 · Galeria din portal

Fiecare copil are o pagină cu tot ce a construit, în ordine cronologică, filtrabilă pe modul.
Descărcabilă integral — e munca copilului, părintele trebuie să o poată lua cu el.

Galeria arată doar documentele trimise. Un document în starea `nou` e încă în revizia adminului, iar
portalul nu are voie să fie o portiță prin care părintele vede ce n-a fost încă verificat.

**Emailul nu duce fișierul, duce în portal.** Linkul din mesaj e `itbridgeschool.com/files/<uuid>`,
cu identificator aleatoriu — niciodată numele copilului — și **cere autentificare**. Părintele intră,
vede lista proiectelor copiilor lui, apasă pe unul, iar backend-ul verifică întâi că acel copil e al
lui și abia apoi generează URL-ul semnat de S3 cu care browserul descarcă. URL-ul de storage nu
ajunge niciodată într-un email, într-un mesaj sau într-un log.

Costul e un pas în plus pentru părinte, și e acceptat: un link care merge fără cont e un link care
merge și pentru cine îl primește forwardat, iar ce se descarcă e munca unui copil identificat cu
numele lui. Pasul în plus se plătește o singură dată — după prima autentificare, sesiunea ține.

Fișierele se servesc ca atașament, niciodată inline de pe domeniul școlii — vezi
[Decizii luate](#decizii-luate).

**Acceptanță:** un părinte descarcă arhiva completă a proiectelor copilului dintr-un singur loc, și
nu vede în ea niciun document netrimis. Un link `/files/<uuid>` deschis fără cont duce la
autentificare, iar același link deschis de alt părinte răspunde 403 — nu 404, fiindcă resursa
există; și nu o pagină goală, fiindcă un refuz tăcut e mai greu de raportat decât unul explicit.

**Livrat.** Arhiva se **streamează**: obiectele se citesc din bucket pe măsură ce zip-ul se scrie în
răspuns, deci procesul ține un fișier o dată, nu munca unui copil pe un semestru. E aceeași greșeală
ca un upload buferat, venită din direcția opusă.

Ecranele nu se pot arăta nimănui până la [E01](E01-infrastructura-medii.md) S4 — sunt pagini de după
autentificare, iar backend-ul nu e deployat. Blocajul e al lui [E18](E18-frontend-portal.md) S4, nu
al acestui story: codul e scris și testat.

### S6 · Vitrina publică

Se publică **lucrarea, nu copilul.** Imaginea e proiectul — ecranul, macheta, pagina construită — și
prin regula din S2 nu conține niciun copil. Textul de lângă ea rămâne prenumele și inițiala, vârsta,
modulul și ce a construit: sunt datele pe care le acoperă consimțământul explicit din
[E07](E07-securitate-gdpr.md) și singurele care mai au sens când în imagine nu apare nimeni. Nimic
altceva — fără nume de familie, fără grupă, fără locație, fiindcă împreună ar spune unde se află un
copil anume, marți la 17:00.

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

**Nu există pas de verificare a cadrului înainte de publicare.** Regula din S2 îl face fără obiect:
dacă nu se fotografiază copii, nu e nimic de căutat în imagine. Revizia de dinainte de publicare
rămâne, dar se uită la ce merită arătat și la calitatea lucrării, nu la cine a intrat în poză. Fără
detecție automată de fețe și fără blurare — nu pentru că ar fi scumpe, ci pentru că nu au ce apăra.

**Acceptanță:** niciun proiect fără consimțământ activ nu e vizibil public. Revocarea are efect în
sub un minut.

**Nelivrat**, și blocat de două lucruri, nu de unul. Cel de infrastructură e cunoscut:
[E01](E01-infrastructura-medii.md) S4, fiindcă vitrina e prima pagină publică din tot site-ul care
are nevoie de backend. **Cel care contează mai mult e [E07](E07-securitate-gdpr.md) S2:** fără
înregistrarea de consimțământ pe `(Profile, Child, scop)` nu există nimic de interogat în momentul
afișării, iar „publică doar dacă cineva a bifat undeva" nu e o regulă, e o presupunere.

Consecința e vizibilă în model: **nu există `isPublic` pe `Project`, deloc.** Nu e o omisiune. E
alegerea de a nu avea un al doilea loc în care se poate răspunde la aceeași întrebare înainte să
existe primul.

### S7 · Corectarea unei atribuiri greșite

Un fișier se salvează într-un folder, iar folderul de lângă e al altui copil. Greșeala apare în prima
lună, iar consecința nu e o jenă: munca unui copil, cu numele lui, ar ajunge în inboxul altei familii.
E o divulgare de date personale.

Trei mecanisme, în ordinea valorii:

1. **Revizia de dinainte de trimitere e mecanismul principal, și e gratuită.** Între momentul în care
   agentul urcă și momentul în care adminul apasă butonul din S4 nu pleacă nimic. Un document în
   starea `nou` se reatribuie altui copil sau se șterge dintr-un click, fără să se reîncarce fișierul.
   Fluxul nou e mai bun decât cel vechi exact aici: înainte, fereastra era un interval de timp până
   la un job de seară; acum e un pas obligatoriu, făcut de un om care se uită.
2. **Adminul șterge și reatribuie și după trimitere**, cu urmă în audit log-ul din
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

**Livrat.** Mutarea nu atinge nimic în stocare, fiindcă cheia ține identificatorii proiectului, nu ai
copilului — aceeași proprietate pentru care merita insistat pe chei fără nume, apărută în alt loc.
Ecranul arată adresa către care a plecat, când a plecat, și spune explicit să sune, nu să trimită un
al doilea email.

Urma corecției stă în trei coloane pe `Project` — de la cine, când, cine a mutat — **nu în audit
log-ul din [E07](E07-securitate-gdpr.md) S3, care nu există.** Se mută acolo când e construit. A
pierde „de la cine" ar face o livrare greșită netrasabilă, iar asta e o divulgare de date personale,
nu o jenă.

## Dependențe

[E07](E07-securitate-gdpr.md) pentru consimțământ — **obligatoriu înainte**, nu după. Din el vin
granularitatea `(Profile, Child, scop)`, scopul de publicare a lucrării și audit log-ul din S3. Scopul
de fotografiere a copilului, propus inițial acolo, nu mai există — vezi [Decizii luate](#decizii-luate).

[E08](E08-multi-locatie.md) pentru numele grupei, sala și locația din care agentul construiește
arborele de foldere. Dependența s-a **subțiat**, nu a dispărut: întrebarea „ce grupă e programată
acum în sala asta" nu se mai pune nicăieri, fiindcă nu mai există ecran care s-o pună. Ce rămâne e
`Group.name` plus sala, ca folderele celor două locații să nu se confunde — și amândouă sunt deja
livrate în E08 S1–S3.

[E09](E09-personal-roluri.md) **nu mai e o dependență.** Nu se mai așteaptă nici rolul de profesor,
care nu se face, nici `Staff`: agentul urcă sub un cont dedicat, iar butonul îl apasă un admin. Vezi
E09, „Ce blochează, de fapt", și [Decizii luate](#decizii-luate).

[E10](E10-curriculum-module.md) pentru modul și lecție în S1, și pentru „ce s-a învățat" din emailul
trimis. Nu e blocantă, și e important că nu e: E10 a ieșit din MVP, iar E14 livrează cu linia goală
și fără cele două relații până când modulele există. Aceeași alegere a făcut-o și
[E12](E12-prezenta-orar.md) S1, care s-a livrat fără ele.

[E12](E12-prezenta-orar.md) pentru ședință: `Project` se leagă de una, iar `ClassSession` se scrie
acolo. Prezența nu mai ordonează nicio listă și nu se deduce din nimic — vezi
[Decizii luate](#decizii-luate).

[E17](E17-comunicare-notificari.md) pentru livrare, pentru butonul de trimitere pe grupă din S9,
pentru coada în care rulează S3b și pentru evidența de livrări din S5, unde apar părinții fără adresă.

[E01](E01-infrastructura-medii.md) S4 pentru S3b și S6: ffmpeg pe host și un backend deployat.

[E02](E02-monorepo-tooling.md) a anticipat deja o a treia aplicație în monorepo, „un uploader pentru
E14". Aia e agentul, și îi stă bine ca workspace lângă `apps/api` și `apps/web`: consumă același
contract `@itbridge/types`, deci o schimbare de payload îi pică typecheck-ul în același CI, nu în
birou, peste trei săptămâni.

## Riscuri

**Riscul numărul unu e ca folderul să devină al doilea loc, nu primul.** Câștigul întreg vine din
faptul că lucrarea se **salvează** direct acolo. Dacă profesorul salvează pe Desktop și copiază
seara, s-a reintrodus exact gestul în plus care a omorât ideile de dinainte, plus o copiere manuală.

**Riscul rămâne, dar mutarea manuală e acceptată ca variantă de rezervă** — decizia patronului. Acolo
unde programul nu poate salva direct pe drive-ul mapat — Scratch în browser e cazul evident,
descărcarea pleacă în `Downloads` fără să întrebe — profesorul trage fișierul în folderul copilului.
Nu se schimbă nimic în cod: agentul urmărește folderul și nu are de unde ști cum a ajuns fișierul
acolo. Ce se schimbă e argumentul: fluxul nu mai e „zero gesturi" peste tot, ci „zero gesturi unde se
poate, unul mic unde nu". Costul e real și e asumat.

Măsurat după lansare: procentul de ședințe cu cel puțin un document. Sub 70%, întrebarea nu mai e
unde stă folderul — e dacă mutarea aia se face. Răspunsul, dacă nu se face, e un folder `_de_sortat`
per grupă, urmărit și el de agent, cu atribuirea făcută de admin pe ecranul grupei: același ecran ca
la `_neatribuite`, deci nu cere nimic nou. Mută gestul de la profesor la admin, ceea ce e un
compromis diferit, nu o soluție mai bună — de aceea nu se construiește înainte să fie nevoie.

**Un punct unic de eșec, într-un birou.** Calculatorul oprit, mutat sau reinstalat oprește tot
fluxul, iar tăcerea lui e ambiguă. Pulsul și alerta din S2 nu sunt un rafinament, sunt condiția în
care riscul rămâne acceptabil.

**Partajarea de rețea e o listă cu numele copiilor, pe un drive.** Un share cu un folder per copil,
lizibil de pe orice mașină din școală, e o divulgare mică dar reală, și e cel mai ușor lucru de
lăsat deschis „temporar". Accesul se dă contului cu care rulează mașinile din laborator, nu grupului
`Everyone`, iar asta se scrie în procedura de instalare a agentului, nu se presupune.

**Argumentul pentru „fără antivirus" s-a subțiat.** Înainte, poarta de intrare era un formular
completat de un profesor autentificat. Acum e un folder de rețea în care poate scrie orice mașină
din școală. Fișierele tot nu se execută nicăieri, iar decizia rămâne aceeași deocamdată — dar
motivul nu mai e la fel de tare, iar condițiile care redeschid discuția sunt în
[Decizii luate](#decizii-luate).

**Datele copiilor pe stocare publică sunt un risc real.** Bucket-ul S3 nu are voie să fie public.
Accesul se face prin URL-uri semnate, cu termen scurt, verificate în backend — cu excepția
miniaturii din email, care e atașament tocmai ca să nu existe URL cu viață lungă.

**Copilul din fundal a fost riscul cel mai ușor de subestimat, și a fost scos, nu atenuat.** În
România imaginea persoanei e protejată separat de GDPR (Cod civil, art. 73), iar copilul din fundal
are altă familie și alt acord — deci contramăsura corectă nu e o verificare umană repetată de două
ori pe săptămână, la sfârșitul orei. E regula de la captare: nu se fotografiază copii. Un risc pe
care îl elimini din procedură nu mai are nevoie de plasă.

Ce rămâne e riscul ca regula să se erodeze în timp — prima poză de grup la finalul unui modul, cerută
cu cele mai bune intenții. De asta e scrisă ca regulă în S2 și ca decizie mai jos, nu ca sfat.

## Decizii luate

**Încărcarea vine dintr-un folder de rețea urmărit de un agent local, nu dintr-o aplicație web.** Un
singur calculator Windows în birou ține partajarea, oglindește grupele și copiii din baza de date,
urmărește ce apare și urcă prin API. Motivul e că orice altă variantă adaugă un gest la sfârșitul
orei — o pagină de deschis, un cont cu care să te autentifici, un buton de încărcare — iar gestul ăla
e singura variabilă care decide dacă epicul e folosit sau nu. Salvarea într-un folder nu e un gest în
plus, e gestul pe care profesorul îl face oricum. Costurile — un singur sistem de operare, un singur
punct de eșec, nicio cale de pe telefon — sunt enumerate în S2 și acceptate.

**Trimiterea o apasă adminul, nu ceasul.** Nu există job de seară. Între un folder în care poate
ateriza orice și cutia poștală a unui părinte, singura verificare posibilă că documentul e al
copilului potrivit e o pereche de ochi. Decizia e a lui [E17](E17-comunicare-notificari.md) S8; aici
se consemnează consecința: `Project` are stare, iar galeria și emailul văd doar ce a fost trimis.

**Nu există rol de profesor; agentul și butonul rulează sub `ADMIN`.** Toți cei care se autentifică
azi sunt admini, deci nu e nimic de așteptat de la [E09](E09-personal-roluri.md): agentul are un
`User` dedicat cu rol `ADMIN`, iar ecranul grupei e o pagină de admin ca oricare alta. Consecința
neplăcută e că credențiala agentului poate face tot ce poate face un admin, inclusiv să emită
facturi. E acceptat pentru că mașina stă în birou și pentru că alternativa — un rol îngust, inventat
doar pentru asta — ar fi primul rol nou dintr-un set amânat explicit. **Se reia la primul profesor
care nu e proprietar**, aceeași condiție ca în E09: atunci agentul primește un rol de serviciu, cu
drept de scriere doar pe `Project`, iar schimbarea e o linie în guard, nu o rescriere.

**Prezența nu se deduce din fișiere.** Un document apărut în folderul unui copil dovedește că cineva
a salvat un fișier, nu că a stat copilul pe scaun; iar un copil prezent care n-a produs nimic e un
caz normal, nu o anomalie — o lecție de teorie, un proiect care se întinde pe două săptămâni. În plus
partajarea e scriibilă de pe orice mașină din școală, la orice oră. Prezența rămâne un act deliberat
al unui om, marcat în [E12](E12-prezenta-orar.md), și cele două nu se ating. Direcția inversă e
permisă și utilă: ecranul grupei poate arăta care dintre copiii prezenți azi n-au încă niciun
document, ca îndemn — o citire, nu o scriere.

**Un copil e într-o singură grupă.** `Child.group` rămâne singular, și motivul dintâi e al copilului:
de două ori pe săptămână e prea mult. Consecința tehnică pentru epicul ăsta e că oglinda de foldere
poate fi un arbore, nu un graf: fiecare fișier are exact un drum către un copil, iar agentul nu are
niciodată de ghicit din ce grupă face parte. Dacă vreodată un copil ar intra în două grupe, arborele
se rupe primul.

**O sală per locație, zece locuri.** Confirmă ce e deja în migrare și în interfață; nu se schimbă
nimic tehnic. Pentru E14 contează într-un singur fel, scris în S4: revizia de dinaintea trimiterii e
realistă fiindcă grupa e mică, și n-ar mai fi la o sută de rânduri.

**Fără registru de device-uri, și fără agent pe calculatoarele din laborator.** Un registru cu token
hash, coduri de înrolare, rotație, revocare și ecran de admin înseamnă săptămâni de muncă, și pune o
credențială de lungă durată pe calculatoare la care stau copii. Fluxul nou face întrebarea fără
obiect: mașinile din laborator n-au nicio credențială, au un drive mapat. `Device` nu era în scopul
niciunui epic — ideea venea din story-ul de uploader al acestui epic, nu din
[E08](E08-multi-locatie.md), al cărui `În scop` listează doar `Location` și `Room`. Ce are E08 e
`Room.computers`, un număr, nu identități.

**Se fotografiază lucrarea, nu copilul. Livrarea e privată.** Decizia are două jumătăți care se
susțin una pe alta.

Prima: în cadru nu intră copii, de la bun început. Nu e un avertisment urmat de verificare manuală,
fiindcă un avertisment se citește o dată și o verificare umană repetată de zeci de ori pe săptămână
eșuează exact în ziua aglomerată. **Problema copilului din fundal dispare structural, nu prin
proces**: poza cu un copil în ea nu se corectează, pur și simplu nu se face.

A doua: documentele ajung exclusiv la părintele copilului respectiv. Nimic nu pleacă spre altă
familie. Vitrina publică rămâne în scop, dar publică **lucrarea**, cu prenumele, inițiala și vârsta
din S6 — nu copilul.

Consecința asupra [E07](E07-securitate-gdpr.md) S2: **scopul de consimțământ pentru fotografierea
copilului nu mai are obiect și se scoate.** Ce se consimte e publicarea lucrării copilului. Un scop
de consimțământ care nu poate fi încălcat, fiindcă situația nu se produce, e o casetă de bifat care
dă fals sentimentul că cineva a decis ceva.

**Fără coautorat pe proiect.** Când mai mulți copii lucrează împreună, fișierul se salvează în
folderul fiecăruia și se creează câte un proiect pentru fiecare. Un rând duplicat e mai ieftin decât
o relație mulți-la-mulți cu consimțământ pe intersecție și revocare în cascadă — la care ar trebui
decis, în plus, ce se întâmplă cu proiectul comun când un singur părinte retrage acordul.

**Un copil are un părinte, cu o adresă.** Documentele merg la un singur `Profile`, și acolo se
opresc. Un al doilea profil pentru aceeași familie ar duplica copilul și ar rupe reducerea de frați,
care se numără per familie: o familie cu doi copii ar plăti doi „primi copii" întregi. Dacă vreodată
apare cerința reală a două adrese, soluția e un al doilea câmp de email pe `Profile` — o coloană — și
tot **un singur email trimis la două adrese**, nu două trimiteri, care ar contrazice S6 din
[E17](E17-comunicare-notificari.md).

**Un singur bucket, prefix `projects/`; cheia doar din identificatori.** Un al doilea bucket ar
promite izolare pe care nu o încasează nimeni la dimensiunea asta; separarea utilă e cea de prefix,
pe care rolul IAM din [E07](E07-securitate-gdpr.md) S6 o poate restrânge dacă apare cerința. Cheia
fără nume de copil e lecția deja plătită pe facturi (S1), iar numele de folder cu identificator din
S2 e aceeași regulă mutată pe partajarea de rețea.

**Video urcă direct în S3 prin URL semnat, nu prin backend.** `uploadFile` buferează tot fișierul,
iar API-ul rulează pe aceeași instanță cu Postgres. Decizia se ia acum pentru că schimbă forma lui
S2, nu doar o constantă.

**Fișierele se servesc ca atașament** — `Content-Disposition: attachment` plus
`X-Content-Type-Options: nosniff` — niciodată inline de pe domeniul școlii, inclusiv pe vitrina
publică. `nosniff` e deja pus pe tot site-ul din `routeRules` în `apps/web/nuxt.config.ts`; ce se
adaugă e regula de servire din backend. S3Service trebuie oricum modificat, fiindcă hardcodează
`application/pdf`, deci costă o linie acum și o rescriere mai târziu.

**Fără antivirus, deocamdată.** Fișierele vin de pe mașinile școlii și nu se execută nicăieri —
rularea proiectelor e deja în afara scopului. ClamAV ar cere ~1GB rezident pe instanța care ține și
Postgres, plus o stare de „carantină" cu text pentru părinți, pentru o situație pe care niciun
părinte n-o va vedea. **Se reia discuția** dacă partajarea ajunge accesibilă din afara rețelei
școlii, dacă părinții încarcă singuri, sau dacă vitrina acceptă trimiteri din afară — vezi Riscuri,
unde e scris de ce argumentul e azi mai slab decât era.

**Miniatura din email e atașament inline (CID), sub ~100KB.** Alternativele erau un URL semnat, un
token de imagine de lungă durată sau un prefix public doar pentru miniaturi. Un URL semnat „cu
termen scurt" e o imagine ruptă când părintele deschide mailul a doua zi dimineața, iar SigV4 nu
trece de 7 zile nici citit generos. Un token lung înseamnă că poza unui minor rămâne accesibilă
pentru totdeauna dintr-o cutie poștală. Atașamentul se vede și offline și nu lasă nimic în urmă.

**Vitrina se randează pe server la cerere, cu cache scurt invalidat la revocare.** Generarea la
build nu poate onora „revocarea are efect în sub un minut" — cerință repetată și în
[E07](E07-securitate-gdpr.md) S2 — fără o cale explicită de invalidare, iar `routeRules` din
`apps/web/nuxt.config.ts` nu are azi nici prerender, nici ISR, doar headere și două redirecturi.
Randarea la cerere e singura variantă care ține sub-minutul fără să atingă celelalte șapte pagini
publice, care rămân independente de backend — regula din CLAUDE.md pentru care site-ul stă în
producție deși backend-ul nu e deployat.

**Accesul la un fișier trece prin cont, nu prin cunoașterea linkului.** `/files/<uuid>` cere
autentificare; backend-ul verifică filiația copil-părinte și abia apoi emite URL-ul semnat de S3.

Alternativa era un URL neghicibil care merge fără cont. A fost respinsă fiindcă un link care merge
fără cont merge pentru oricine îl primește mai departe, iar ce se deschide e munca unui copil cu
numele lui pe ea. Nu e o scurgere gravă — [S6](#s6--vitrina-publică) publică oricum lucrări, nu
copii — dar diferența de efort între cele două variante e un ecran de login, iar diferența de
control e totală.

Consecința, pentru orice canal care ar duce linkul altundeva decât în email: **linkul e un anunț, nu
o livrare.** Cine îl deschide ajunge la autentificare. Conta când se discuta un canal secundar;
[E17](E17-comunicare-notificari.md) l-a scos din MVP, deci deocamdată nu se pune.

## Definition of done

Peste 80% dintre ședințe au cel puțin un document urcat, fără ca cineva să încarce ceva manual.
Adminul trimite pe grupă, iar părinții cu adresă în sistem primesc; restul apar în evidența de
livrare din [E17](E17-comunicare-notificari.md). Vitrina publică are proiecte reale, cu consimțământ.

## Întrebări deschise

- ~~Se poate salva direct pe drive-ul mapat, din programele folosite la curs?~~ **Nu mai blochează
  nimic.** Unde se poate, se salvează direct; unde nu — Scratch în browser descarcă în `Downloads`
  fără să întrebe — profesorul mută fișierul în folderul copilului, iar asta e acceptat ca variantă
  de rezervă. Vezi [Riscuri](#riscuri) pentru ce se face dacă mutarea nu se întâmplă în practică.
- **Ce se salvează, concret, și cât de mari sunt fișierele?** Rămâne de văzut într-o zi de observație,
  dar nu ține nimic pe loc: limitele din S1 sunt un ordin de mărime care merge, nu o politică, iar
  schimbarea lor e o constantă în `file-types.ts`.
- **Rămâne calculatorul din birou pornit?** _De confirmat._ **Recomandare:** pornit permanent, cu
  agentul ca serviciu Windows care repornește singur, plus pulsul din S2. Alternativa — pornit doar
  în program — e acceptabilă, dar atunci întârzierea de încărcare devine o proprietate a fluxului și
  trebuie spusă adminului în interfață, nu descoperită.
- ~~Merită reluat registrul de device-uri?~~ **Nu.** Calculatoarele din laborator nu mai au nicio
  credențială — vezi [Decizii luate](#decizii-luate).
- ~~Un copil are exact un `Profile`, deci documentele merg la o singură adresă — rămâne așa?~~
  **Da, un copil are un părinte cu o adresă.** Motivul și ce s-ar face dacă se cere altceva sunt în
  [Decizii luate](#decizii-luate).
- ~~Vor părinții să vadă proiectele altor copii din grupă?~~ **Nu.** Livrarea e privată: nimic nu
  ajunge la altă familie. Ce se poate arăta în afara familiei se arată pe vitrina publică, cu
  consimțământ, și acolo e lucrarea, nu copilul.

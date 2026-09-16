# E07 · Securitate, GDPR și consimțământ

**Status:** în lucru — **S1, S3, S4, S5 și S8 livrate**, restul propus · **Pistă:** Fundație · **Depinde de:**
E04, E05 · **Blochează:** E14, E19; E09 doar odată cu reluarea lui S2

> **Granița cu [E22](E22-termeni-si-date.md), fiindcă se confundă ușor: aici e mecanica, acolo e ce
> citește și acceptă familia.** Cele două epicuri descriau aceleași patru lucruri cu cuvinte
> diferite, iar un inventar ținut în două locuri e exact defectul pe care restul repo-ului îl evită.
> Împărțirea, din septembrie 2026:
>
> | Subiect                                   | Cine îl ține                                                                 |
> | ----------------------------------------- | ---------------------------------------------------------------------------- |
> | Inventarul câmpurilor                     | **E07 S1**, o singură dată. E22 îl citește, nu îl reface                     |
> | Textele juridice                          | **E22 S2** — termenii contului, nota de confidențialitate, cookie-urile      |
> | Bannerul care chiar blochează scripturile | **E07 S5** — cod, nu proză                                                   |
> | Consimțământul de publicare               | **E07 S2**, pe `(Profile, Child, scop)`                                      |
> | Ce versiune a acceptat cine, și când      | **E22 S4**                                                                   |
> | Termenul de păstrare                      | scris în **E22 S3**, executat de **E07 S4** și [E04](E04-migrari-date.md) S5 |
>
> Regula din care iese tabelul: dacă rezultatul e un document pe care îl citește un părinte, e al
> E22; dacă rezultatul e un rând, un endpoint sau un script, e al epicului ăstuia.

## Problemă

Platforma procesează date despre **minori**. În Uniunea Europeană asta e categoria cu cel mai
strict regim, iar școala e operator de date, nu intermediar. Starea actuală nu susține asta.

- **O cheie privată reală e în istoricul git**, într-un repo public. Vezi
  [E01](E01-infrastructura-medii.md), S1.
- **Secretele JWT au fallback tăcut** către valori publice. Vezi [E05](E05-robustete-backend.md), S3.
- **Nu există politică de confidențialitate, nici banner de cookie-uri**, deși site-ul e public și
  se adresează unui public din UE.
- **Nu există noțiune de consimțământ.** [E14](E14-proiecte-elevi.md) urmează să publice munca unor
  copii, iar [E19](E19-seo-geo.md) să o folosească drept conținut de marketing. Fără consimțământ
  parental înregistrat, ambele sunt ilegale.
- **Nu există audit log.** Un admin poate șterge o factură, schimba o sumă sau modifica datele unui
  copil, fără urmă.
- **Nu există export sau ștergere de date la cerere**, deși sunt drepturi pe care un părinte le
  poate exercita oricând, cu termen legal de răspuns.
- **Nu există evidența contractelor de înscriere.** Regulile pe care se sprijină banii și programul —
  „se cumpără un modul, nu un număr de ședințe" din [E12](E12-prezenta-orar.md), „fără returnare la
  abandon" din [E15](E15-pricing-facturare.md) — sunt clauze contractuale, dar nimeni nu poate spune,
  fără să caute prin bibliorafturi, dacă o familie anume a semnat și când.
- **Datele de contact ale copiilor și părinților nu sunt clasificate.** Nimic nu spune ce e sensibil
  și ce nu, deci nimic nu împiedică o dată personală să ajungă într-un log sau într-un raport de
  eroare.

## Rezultat

Poți răspunde în scris, cu dovezi, la: ce date țineți despre copilul meu, cine le-a văzut, pe ce
temei, cât le păstrați, și cum le ștergeți. Publicarea muncii unui copil se întâmplă doar cu
acordul explicit al părintelui, revocabil.

## În scop

- Inventar de date și clasificare.
- Consimțământ parental granular, cu istoric.
- Audit log pe acțiunile administrative.
- Export și ștergere la cerere.
- Politică de confidențialitate, termeni, banner de cookie-uri.
- Evidența contractelor de înscriere semnate pe hârtie: pentru fiecare înscriere, faptul, data și,
  dacă e cazul, versiunea.
- Managementul secretelor.
- Contracte de prelucrare cu furnizorii.

## În afara scopului

- Consultanță juridică. Acest epic pregătește platforma; textele legale — politica, termenii și
  contractul de înscriere — le scrie și le validează un avocat.
- Textul contractului de înscriere ținut ca document versionat în platformă și acceptarea lui
  digitală, cu tot ce ține de semnătură electronică. Contractul se semnează fizic. Vezi S8.

## Story-uri

### S1 · Inventar și clasificare — livrat

Un tabel cu fiecare câmp de date personale: unde e stocat, de ce, pe ce temei legal, cât se
păstrează, cine îl poate vedea. Include datele copiilor — nume, dată de naștere, prezență, proiecte,
fotografiile lucrărilor.

**Inventarul stă aici, o singură dată.** [E22](E22-termeni-si-date.md) S2 scrie nota de
confidențialitate **din** el, nu alături de el: două tabele întreținute separat diverg, iar cel care
ajunge sub ochii unei familii ar fi tocmai cel rămas în urmă. Derivarea din entități e cerința care
ține linia — aceeași disciplină ca `contract.ts`.

**Acceptanță:** tabelul e complet, fiecare câmp are temei legal identificat, iar o coloană nouă cu
date personale nu poate ajunge în producție fără să apară în el.

**Livrat.** Sursa e `apps/api/src/privacy/data-inventory.ts`, documentul e
[`docs/inventar-date.md`](../inventar-date.md), randat din ea. **Toate cele 231 de coloane din cele
30 de tabele sunt clasificate**, nu doar cele personale: fiecare e ori dată personală cu cele cinci
răspunsuri completate, ori nu e, cu un motiv dintr-o listă scurtă. Nu există a treia stare, fiindcă
a treia stare e exact felul în care un număr de telefon ajunge neclasificat. **99 de coloane sunt
date personale**, în 22 de tabele.

Propoziția care face din asta cod, nu proză, e ultima din acceptanță, și e ținută de
`data-inventory.spec.ts`. Acesta citește metadatele **lui TypeORM**, nu o listă întreținută de
cineva — `getMetadataArgsStorage()` se umple din decoratori la import, deci o coloană adăugată mâine
e acolo mâine —, și pică pe cinci lucruri, fiecare demonstrat pe o greșeală reală înainte de a fi
crezut:

- o coloană fără clasificare;
- o clasificare a cărei coloană nu mai există (un rând învechit e mai rău decât unul lipsă: se
  citește ca răspuns);
- un scop lăsat gol sau pus ca `TODO`;
- documentul rămas în urmă față de cod, fiindcă altfel „nota se scrie din inventar" e o promisiune
  fără gardă;
- **un drum care nu duce nicăieri**: `linkedVia` spune cum se ajunge de la un rând la familia lui,
  iar testul îl parcurge relație cu relație și cere să se termine la `Profile`. E coloana pe care o
  va citi S4 — un export trebuie să găsească fiecare rând despre o familie, iar o ștergere aceeași
  mulțime —, deci un drum inventat ar fi o gaură pe care nimic nu ar semnala-o.

Trei tabele **nu** se pot ajunge prin relații, și scrie de ce la fiecare: `unassigned_files` (drumul
a eșuat, tocmai asta consemnează rândul), `outbox` (coada e partajată și scrie și către birou, deci
S4 caută după adresă) și `audit_log` (trimite la rândul schimbat prin tip și id, fiindcă o relație
către un rând care se poate șterge e cum pierde un jurnal exact intrările care contează).

Două lucruri pe care le-a scos la iveală clasificarea și care nu se vedeau de nicăieri:
`unassigned_files.relativePath` **poate conține numele unui copil** — calea trece prin folderele
lor —, iar `projects.sentToEmail` e **a doua copie** a adresei părintelui, înghețată la trimitere.
Amândouă sunt lucruri pe care S4 trebuie să le găsească.

**Termenele nu sunt aici.** Coloana „cât se păstrează" grupează câmpurile în cinci reguli — contul,
obligația contabilă, operațional, expiră singur, evidență —, iar numărul pe care îl pune fiecare
regulă e al [E22](E22-termeni-si-date.md) S3. Așa, S3 pune cinci numere, nu două sute treizeci și
unu.

### S2 · Consimțământ parental

Entitate de consimțământ pe tripleta **`(Profile, Child, scop)`**: părintele consimte, dar subiectul
datelor e copilul. Fiecare înregistrare are dată, versiune de text acceptat și revocare.

**Granularitatea doar pe `Profile` nu funcționează**, deși așa era scris aici înainte. Un părinte
acceptă publicarea pentru cel mare, care e mândru de ce a construit, și o refuză pentru cel mic —
cazul obișnuit, nu unul de margine. Cu un singur rând pe familie, singurele răspunsuri exprimabile
sunt „toți copiii" și „niciunul", iar [E14](E14-proiecte-elevi.md) S6 publică _per copil_ („prenume
și inițială, vârstă"), deci ar publica un copil pentru care nu există acord. `Child` există deja ca
entitate proprie (`apps/api/src/entities/child.entity.ts`), iar consimțământul nu e construit
nicăieri — o căutare după `consent` în `apps/api/src` nu întoarce nimic. Deci schimbarea costă azi
o linie de doc; după ce există primul rând, costă o migrare pe date reale.

Trei scopuri:

1. publicarea **lucrării** copilului pe vitrina publică din [E14](E14-proiecte-elevi.md) S6, cu
   prenume, inițială și vârstă;
2. lucrarea și fotografia ei în materiale de marketing — [E19](E19-seo-geo.md);
3. comunicări comerciale.

**Fotografierea copilului nu e printre ele, fiindcă nu se întâmplă.** Se fotografiază lucrarea, nu
copilul — fără fețe, fără copii în cadru, din clipa în care se apasă declanșatorul. Un scop de
consimțământ pentru un act care nu are loc nu e o precauție în plus: e o bifă pe care S2 ar trebui
totuși să o ceară, să o stocheze și să o verifice, fără ca răspunsul ei să schimbe vreodată ceva. Iar
motivul pentru care fusese propus — imaginea persoanei e protejată în România separat de GDPR, prin
art. 73 din Codul civil, deci ar avea nevoie de temei propriu, nu de unul împrumutat de la publicare
— dispare odată cu obiectul: nu există imagine de persoană. Vezi [Decizii luate](#decizii-luate).

**Partajarea proiectului cu ceilalți părinți din grupă a ieșit din listă din același motiv**: nu se
face. Livrarea e privată, proiectul ajunge exclusiv la părintele copilului respectiv.

**Livrarea proiectului propriu către propriul părinte nu depinde de niciunul dintre aceste
acorduri.** E executarea contractului dintre școală și familie (S8), nu consimțământ. Altfel un
părinte care refuză marketingul ar înceta să primească munca copilului lui, iar acordul ar deveni
condiție de serviciu — moment în care nu mai e liber exprimat, deci nu mai e valabil nici pentru
marketing. Trimiterea pe grupă din [E14](E14-proiecte-elevi.md) S4, pe care o apasă adminul după
revizie, pleacă indiferent de bifele de mai sus.

Revocarea trebuie să aibă efect **retroactiv și automat**: un proiect publicat dispare de pe site
când părintele retrage acordul, fără intervenție manuală.

**Înregistrarea de aici e sursa de adevăr.** Dacă [E14](E14-proiecte-elevi.md) ține o stare de
consimțământ pe `Project`, aceea e un instantaneu pentru viteza de afișare, nu un al doilea loc în
care se poate răspunde altceva: un proiect e public doar dacă există consimțământ activ pentru acel
copil și acel scop în momentul afișării.

**Acceptanță:** [E14](E14-proiecte-elevi.md) nu poate publica un proiect fără consimțământ activ
pentru copilul acela și scopul acela. Revocarea îl retrage în sub un minut. Un părinte cu doi copii
poate accepta pentru unul și refuza pentru celălalt, iar vitrina arată exact asta.

### S3 · Audit log — livrat

Fiecare acțiune administrativă care atinge date personale sau bani lasă o înregistrare: cine, ce,
când, valoarea veche și cea nouă. Imutabil, cu retenție separată de datele operaționale.

**Acceptanță:** "cine a schimbat suma facturii 412 și când" are răspuns în sub un minut.

**Banii.** `audit_log` (`apps/api/src/entities/audit-log.entity.ts`) plus
`apps/api/src/modules/audit/`, legat în cele trei module unde se mișcă bani — facturi, plăți,
reduceri. Acceptanța rulează capăt-la-capăt în `apps/api/test/audit-log.e2e-spec.ts`: după o
schimbare de sumă, `GET /audit?entityType=Invoice&entityId=412` întoarce cine, ce a fost și ce a
devenit. Cinci decizii pe care le repetă oricine adaugă un al patrulea scriitor:

- **Rândul se scrie cu `EntityManager`-ul tranzacției care l-a provocat**, ca la outbox. O urmă care
  supraviețuiește unei tranzacții date înapoi spune că s-a întâmplat ceva ce nu s-a întâmplat, iar
  una pierdută când schimbarea a reușit e o gaură. `AuditService.record` primește managerul; toate
  apelurile de azi i-l dau.
- **Nu există `update` și nu există `delete`** — nici metodă, nici endpoint. Singurul lucru care se
  poate face tabelului prin aplicație e să i se adauge. Ăsta e tot rostul lui.
- **Actorul e denormalizat**, `actor_user_id` plus `actor_username` copiat la scriere. O urmă care
  arată către un rând ce poate fi șters pierde exact intrările care contează: cele despre un cont
  scos ulterior.
- **`changes` ține doar ce s-a mișcat**, nu rândul întreg — și numai scalari
  (`AuditValue`). Un „înainte și după" al întregii facturi ar face din jurnal a doua copie a datelor
  unei familii, adică fix invers decât cere epicul. O salvare care n-a schimbat nimic **nu scrie
  nimic**: `recordUpdate` iese devreme.
- **Derivările nu se consemnează.** `recomputeInvoiceStatus` mută starea facturii fiindcă s-au
  adunat plăți; e o consecință, nu o decizie. Un jurnal în care fiecare derivare stă lângă deciziile
  oamenilor e un jurnal în care deciziile nu se mai găsesc.

Se consemnează: emiterea (`POST /invoices/issue` și `POST /invoices`, un rând per factură, inclusiv
lunile `waived`), editarea și ștergerea unei facturi, corectura de ședințe pe copil și lună
(`SessionCountOverride` — singurul număr tastat de mână), plata înregistrată, corectată sau ștearsă,
și reducerea creată, editată, ștearsă sau dată din butonul de recomandare. Citirea e
`GET /audit`, numai ADMIN, cu plafon de 200 pe cerere: jurnalul crește nemărginit prin construcție,
deci o citire nemărginită ar fi o cale de a trage tot istoricul de bani al unei familii printr-o
singură cerere.

**Datele personale, și decizia care le desparte de bani.** Modificările de `Profile` și `Child`
lasă acum urmă, dar consemnează **numele câmpurilor care s-au mișcat, niciodată valorile lor**.
Povestea cerea „valoarea veche și cea nouă"; la un profil _valoarea însăși e dată personală_, iar
argumentul care decide nu e de gust, ci din inventarul S1: câmpurile lui `Profile` și `Child` au
retenția `account` — pleacă odată cu familia —, iar `audit_log` are retenția `audit`, fiindcă
supraviețuiește lucrului pe care îl descrie. Scrise în jurnal, fiecare telefon și fiecare adresă pe
care le-a avut vreodată o familie ar rămâne de partea greșită a acelei granițe, într-un tabel pe
care ștergerea din S4 nu-l atinge — și nu-l poate atinge, fiindcă n-are relație către profil,
tocmai ca să rămână răspuns la „cine a șters familia 412" după ce familia 412 nu mai e.

Deci „cine a schimbat adresa copilului 87, și când" are răspuns; „care era adresa dinainte" nu are,
și asta e intenția. Se consemnează crearea, editarea și ștergerea unui `Profile` și ale unui
`Child` — cele șase drumuri prin care un om atinge datele unei familii de la un ecran. Creația e
acolo fiindcă rândul nou nu poate răspunde singur **cine** l-a scris: o familie introdusă la telefon
n-are altă evidență decât asta. Trei lucruri de știut:

- **Ce a fost atins se calculează, nu se presupune.** `changedFieldNames`
  (`apps/api/src/modules/audit/personal-fields.ts`) compară rândul de dinainte cu peticul: un câmp
  netrimis nu e o schimbare, un `null` sau un `''` trimis **este** una, iar o dată de naștere
  retrimisă neschimbată nu e, deși vine în două forme diferite din cele două capete.
- **O salvare care n-a mișcat nimic nu scrie niciun rând**, ca la bani: `recordPersonalDataChange`
  iese devreme pe listă goală.
- **`changes` păstrează forma comună**, cu `from` și `to` pe `null`, ca un singur ecran să citească
  ambele jumătăți ale jurnalului. Nota rândului spune de ce sunt goale.

**Retenția nu e decisă aici.** Numărul e al [E22](E22-termeni-si-date.md) S3, iar jobul care îl
aplică e al S4 de mai jos și al [E04](E04-migrari-date.md) S5.

### S4 · Export și ștergere — livrat

Un părinte poate cere, prin portal, exportul datelor sale și ale copiilor, în format citibil, și
ștergerea contului. Ștergerea respectă obligațiile contabile: facturile se păstrează, dar se
anonimizează în rest.

**Termenul pe care îl aplică ștergerea e scris în [E22](E22-termeni-si-date.md) S3**, nu aici: „după
cât timp" e o promisiune făcută familiei, deci trăiește în documentul pe care aceasta l-a citit. Aici
e drumul pe care îl parcurge o cerere, iar în [E04](E04-migrari-date.md) S5 e jobul care îl parcurge
periodic. Trei locuri, trei treburi diferite, un singur număr — al E22.

**Acceptanță:** ambele fluxuri funcționează capăt-la-capăt, cu termen sub 30 de zile.

**Livrat: exportul.** `GET /privacy/export` întoarce tot ce ține școala despre familia care cere —
datele de contact, contul, copiii cu înscrierile, prezențele, absențele anunțate și proiectele lor,
facturile cu plățile, reducerile, solicitările de probă, mesajele primite, sesiunile și documentele
acceptate. Butonul e pe `/user/profile`, iar fișierul se construiește în browser din JSON-ul
serverului. Adminul poate produce același document pentru o familie care a sunat, prin
`GET /privacy/export/:profileId` — rută separată, nu un parametru opțional pe prima: un endpoint a
cărui audiență depinde de un query string e la un refactor distanță de a o servi pe cealaltă.

Patru decizii:

- **Nu există `:id` pe ruta părintelui.** Profilul vine din token, deci nu există parametru de
  schimbat. E forma cea mai tare a regulii pe care restul codului o ține în serviciu, aplicată acolo
  unde payload-ul e _tot_ ce știe școala.
- **Cheile de la casă nu se dau înapoi.** Hash-ul parolei și cel al tokenului sunt date personale și
  sunt în inventar ca atare, dar întoarse familiei nu-i spun nimic, iar cuiva care citește fișierul
  îi dau ceva de ghicit. Ce primește familia e că o sesiune a existat, când și de pe ce dispozitiv.
- **Nimic despre altă familie.** O ședință spune când s-a ținut grupa — e orarul școlii, și intră.
  Cine a mai stat în sală, nu. Testul de integrare verifică asta pe două familii reale, fiindcă e
  singurul loc unde se poate verifica.
- **Cheile documentului sunt în română**, spre deosebire de restul codului. Nu e cod, e răspunsul pe
  care îl citește o familie; art. 15 îl cere inteligibil pentru ea, ca textele din interfață și ca
  e-mailurile.

Legătura cu S1 e ținută de un test, nu de memorie: interogările sunt scrise de mână, ca forma
răspunsului să semene cu viața familiei și nu cu un dump de tabele normalizate, iar `export.spec.ts`
pică dacă inventarul numește un tabel cu date de familie pe care exportul nu-l citește. Asta face
`linkedVia` să conteze, nu doar să existe. Două tabele sunt excluse **cu motiv scris**: `audit_log`
(consemnează ce a făcut personalul, iar o felie din activitatea lor e altă funcționalitate, cu alte
întrebări în spate) și `unassigned_files` (rândul există tocmai fiindcă legătura cu un copil a
eșuat).

**Un avertisment care e al modelului, nu al exportului.** O probă programată de pe formularul public
scrie un `Profile` **coajă**, fără cont (E20/S2, dinadins: coloanele alea sunt unice, iar un formular
public n-are voie să scrie în rândul altei familii). Dacă familia se înregistrează mai târziu,
`register` scrie un al doilea `Profile`, iar unirea celor două e treaba adminului la înscriere. Cât
timp nu sunt unite, `GET /privacy/export` — care pleacă de la cont — nu vede lead-ul, fiindcă pentru
bază el e al altcuiva. Exact pentru asta e ruta de admin: biroul exportă profilul-coajă după id.

**Livrat: ștergerea.** Familia cere din `/user/profile` (`POST /privacy/erasure`), biroul o duce la
capăt din `/admin/stergeri` (`POST /privacy/erasure/:profileId`). Cererea nu șterge nimic: legea dă
o lună, iar biroul trebuie să se uite întâi — la cine cere și la ce păstrează obligația contabilă.
Ambele butoane cer **două apăsări**; cel din portal fiindcă nu e nimic de partea cealaltă a lui, cel
din birou fiindcă acela chiar șterge, iar armarea e **pe rând**: armezi o familie, apeși pe alta, și
a doua nu se șterge.

**Nu e ștergerea logică din [E04](E04-migrari-date.md) S5.** Aceea e o stare „retras", reversibilă,
pe care o pune adminul când o familie nu mai vine; asta e dreptul pe care îl exercită familia, și
taie prin orice stare logică. Cele două poartă nume diferite dinadins: un soft delete care răspunde
la cuvântul „ștergere" e felul în care o platformă îi spune unei familii că datele ei au dispărut
când n-au dispărut.

**Rândul familiei supraviețuiește, golit.** `Invoice.parent` e `CASCADE`, deci ștergerea rândului ar
lua evidența contabilă cu ea — iar E04 S5 a decis că platforma păstrează evidența a ce a plătit o
familie chiar dacă documentul fiscal e al SmartBill. Deci rândul rămâne o coajă: nume înlocuit,
email, telefon, adresă și contact de urgență golite, `marketingOptIn` pe `false`, `erasedAt` pus.
Email și telefon devin `null`, nu un text inventat: coloanele sunt unice, deci două familii șterse
s-ar ciocni pe orice valoare născocită, iar o adresă inventată nu se poate deosebi de una reală care
respinge mesajele — același argument ca la rândul nelivrabil din E17 S5.

**Cascadele fac cea mai mare parte, și ăsta e tot ideea.** Ștergerea unui `Child` ia cu ea
înscrierile, prezențele, absențele anunțate, cererile din listă, corecturile de ședințe și
proiectele; ștergerea `User`-ului ia sesiunile, confirmările de email și acceptările de documente.
Ce **rămâne pe dinafară** e exact ce serviciul trebuie să spună cu voce tare, și sunt patru lucruri:

- **Lead-urile își țin propriile copii ale numelor.** `Lead.child` e `SET NULL`, iar rândul poartă
  `childFirstName`, `childLastName` și `childBirthDate`. Ștergerea copilului le-ar lăsa pe toate
  trei în `leads`. Se caută **și după adresă, nu doar după legătură**: `Lead.profile` e scris de un
  singur apelant, formularul public de probă din E20/S2, deci familia care a sunat întâi la telefon
  are un rând cu numele ei, adresa, telefonul și numele copilului la care nu arată nimic. Regula e
  în `apps/api/src/modules/privacy/family-rows.ts` și o citesc **amândouă** fluxurile — altfel
  exportul și ștergerea ar ajunge să răspundă diferit la aceeași întrebare, „care rânduri sunt ale
  familiei ăsteia". E sigur fiindcă `Profile.email` și `Profile.phone` sunt unice, deci o adresă
  identifică o singură familie sau niciuna; și poate găsi doar **mai multe** rânduri, niciodată mai
  puține.
- **Outbox-ul n-are relație către profil** — coada e partajată și scrie și către birou —, deci
  rândurile se caută după adresă, exact cum spune inventarul din S1 că va trebui.
- **`Payment.notes` e text liber scris de un admin despre o familie**, pe un rând care se păstrează.
  Cifrele rămân, fiindcă sunt evidența contabilă; propoziția nu.
- **Reducerile pleacă.** Epicul păstrează facturile și nimic altceva, iar un rând de reducere
  numește motivul pentru care o anumită familie a plătit mai puțin. Factura poartă deja numărul.

**Se golește și bucket-ul**, după ce tranzacția a făcut commit, nu înăuntrul ei: stocarea de
obiecte n-are rollback, deci ștergerea lucrărilor unui copil urmată de o tranzacție care cade ar
distruge fișierele unei familii care rămâne pe fișă. Cheile se citesc **înainte** ca rândurile să
plece, fiindcă se derivă din identificatori și după aceea n-ar mai avea din ce fi calculate — iar
obiectele ar rămâne acolo pentru totdeauna. Un obiect care nu s-a putut șterge e o linie de log, nu
o ștergere eșuată: e recuperabil, spre deosebire de o ștergere care a lăsat rândurile în urmă. PDF-
urile facturilor rămân, împreună cu facturile.

**Un lead lăsat la o adresă pe care familia a schimbat-o între timp nu se găsește**, și e același
punct orb ca al outbox-ului, din aceeași cauză: nicio relație, doar o adresă, și niciun istoric de
adrese — E07 S3 consemnează dinadins numele câmpului, nu valoarea. Se repară în ziua în care rândul
are o legătură, nu prin ghicit.

**Ce nu se poate atinge**, scris aici în loc să fie descoperit mai târziu: un fișier pe care agentul
nu l-a putut atribui (`unassigned_files`) poate purta numele unui copil în cale, și nu există
legătură de la el către o familie — eșecul acelei legături e chiar conținutul rândului. Se curăță de
mână, din ecranul care le listează, iar nota de pe `/admin/stergeri` spune asta.

**Urma supraviețuiește familiei, și trebuie să supraviețuiască.** Intrarea din audit log se scrie în
aceeași tranzacție, iar „cine a șters familia 412 și când" rămâne de răspuns **tocmai fiindcă** tot
restul a dispărut. E sigur fiindcă jurnalul ține identificatori, nu nume (E07 S3) — verificat în
test: după ștergere, nici prenumele copilului, nici adresa familiei nu apar în el.

### S5 · Bannerul de cookie-uri și blocarea scripturilor — livrat

Bannerul care chiar **blochează scripturile neesențiale până la accept** — nu unul care anunță că
site-ul folosește cookie-uri după ce le-a pus deja. E singura bucată din vechiul „documente legale"
care e cod, și de asta a rămas aici.

**Textele au plecat la [E22](E22-termeni-si-date.md) S2** — politica de confidențialitate, termenii
și politica de cookie-uri —, iar istoricul acceptărilor la E22 S4. Ele se scriu la final, cu
platforma în față; bannerul se poate construi înainte, fiindcă mecanismul nu depinde de ce scrie în
text.

Contractul dintre școală și familie e alt lucru și se semnează pe hârtie — vezi S8. Dreptul de
retragere în 14 zile nu intră în niciunul; motivul e la [Decizii luate](#decizii-luate).

**Acceptanță:** un vizitator nou nu are niciun cookie neesențial înainte de a accepta, iar nicio
cerere către un domeniu terț neesențial nu pleacă din pagină — verificat în tab-ul de rețea, nu în
configurație.

#### Ce s-a construit, și de ce nu e un banner

**Nu există niciun script neesențial de blocat, și un singur terț de oprit: harta.** Inventarul,
făcut înainte de orice cod: zero unelte de analiză, zero pixeli, zero reclame, fonturile servite de
pe domeniul propriu, imaginile locale; patru cookie-uri, toate ale noastre, toate în spatele
autentificării. Singurul lucru care pleca din pagină era `<iframe>`-ul Google Maps de pe cele două
pagini de locație — și pleca **de la sine**, fiindcă avea `loading="lazy"`, care se citește ca
reținere și e opusul: se declanșează când cititorul derulează până la el. Nimic din sursă nu spunea
„cheamă Google la derulare"; browserul o spunea.

Deci poarta e acolo unde e terțul, nu peste tot: `MapEmbed.vue` arată adresa, legătura către Google
Maps și un buton, iar `<iframe>`-ul **nu există în DOM** până nu se apasă. `v-if`, nu `v-show` și
nu un `src` schimbat — un iframe ascuns cu `src` pus e o cerere care a plecat deja.

**Un banner pe toate paginile ar fi fost în plus, și mai rău decât în plus.** Nu are ce să blocheze
pe zece din douăsprezece pagini, iar un dialog care apare mereu și n-are ce refuza devine o bifă
apăsată reflex — același motiv pentru care avertismentul de la E17 S7 nu blochează. Ziua în care
intră prima unealtă de analiză (E19 S8) e ziua în care apare al doilea scop în `consentStore`, și
atunci un banner are ce cere. Până atunci, cine vrea să știe ce se pune și cât ține are legătura
către `/cookies` chiar sub buton.

**Alegerea nu se scrie nicăieri** — asta răspunde întrebării pe care politica de cookie-uri o lăsase
deschisă, „un cookie `mapConsent` sau întrebăm de fiecare dată". Nici, nici: `consentStore` ține
scopurile acordate în memorie, deci apeși o dată și amândouă paginile de locație o respectă, iar la
vizita următoare întrebăm din nou. Un cookie de consimțământ ar fi fost legal fără consimțământ, dar
ar fi costat propoziția pe care politica o face fiecărui cititor — _un vizitator care nu se
autentifică nu primește niciun cookie_ —, iar o promisiune adevărată fără nota de subsol valorează
mai mult decât o apăsare economisită la a doua vizită.

**Acceptanța rulează, nu se ține minte.** `apps/web/scripts/check-third-party.mjs` (`pnpm
test:privacy`, în CI lângă verificarea de accesibilitate, cu care împarte serverul și browserul prin
`preview-site.mjs`) încarcă fiecare pagină din sitemap într-un Chromium adevărat, **o derulează până
jos** ca să dea drumul la orice e lazy, și pică la prima cerere care iese din origine sau la primul
cookie. Derularea e tot rostul rulării: fără ea, bug-ul de dinainte trece verde, fiindcă iframe-ul
de sub linia de plutire nu intră niciodată în vizor. Verificat pe ambele sensuri — cu poarta scoasă,
verificarea pică pe exact cele două pagini și numește cele două origini Google.

Verifică și **cealaltă jumătate a porții: că apăsarea chiar arată harta.** Nu e zel — bug-ul a
existat și a fost prins de gardă, nu la review. `useReveal` decupează fiecare `.plate` la zero până
când observatorul lui o marchează, iar observatorul își face recensământul o singură dată, la
montare; o placă apărută mai târziu nu e marcată niciodată și rămâne decupată **definitiv**. Adică:
cititorul apasă, cererea pleacă spre Google, și i se arată o casetă goală — cel mai prost dintre
cele trei rezultate posibile. Nimic din el nu se vede în sursa vreunuia dintre cele două fișiere.
Soluția e `is-revealed` pe placă, iar `MapEmbed.vue` scrie de ce, fiindcă arată exact ca o clasă de
prisos. Garda apasă butonul cu Google rutat spre `abort`, deci nu face nicio cerere externă, și
**așteaptă ștergerea în loc să citească o dată**: animația pornește de la decupajul închis, deci o
citire la momentul apariției nu deosebește o hartă care merge de una care nu — prima versiune a
verificării a raportat exact bug-ul pe care tocmai îl reparase.

Ce **nu** face: nu apasă butonul în trecerea de rețea. Cititorul care cere harta primește Google, cu
consecințele scrise lângă buton; acolo garda e despre cititorul care nu cere.

O corectură căzută din inventar: politica spunea că memoria locală e a portalului, iar `localStorage`
are `nuxt-color-mode` scris pe **orice** pagină, de la prima. Nu e cookie și e strict necesar în
același sens, deci nu schimbă ce cerem — dar §3 îl numește acum, fiindcă un document care
enumeră greșit e un document care nu mai e citit.

### S6 · Managementul secretelor

Secretele stau într-un magazin dedicat, nu în fișiere pe VPS și nu în repo. Rotație documentată.
`.env.example` conține doar chei, niciodată valori.

Pe EC2, accesul la S3 se face prin **IAM instance role**, nu prin chei statice.
`AWS_ACCESS_KEY_ID` și `AWS_SECRET_ACCESS_KEY` — astăzi transmise ca variabile de mediu și
vizibile în `docker-compose.yml` — dispar complet din configurație. Rolul primește drepturi doar
pe bucket-ul de fișiere, doar operațiile necesare. E cea mai ieftină îmbunătățire de securitate
din tot epicul: elimină o clasă întreagă de secrete în loc să le gestioneze.

**Acceptanță:** o căutare de secrete în repo, cu o unealtă automată, nu găsește nimic. Scanarea
rulează în CI. Nicio cheie AWS statică nu există în vreun mediu.

### S7 · Contracte de prelucrare

Acorduri de prelucrare a datelor cu fiecare furnizor care atinge date personale: găzduire, S3,
furnizorul de email din [E17](E17-comunicare-notificari.md), Sentry, Vercel. Preferință pentru
procesare în UE.

**Acceptanță:** lista furnizorilor e completă, cu locul de procesare și statusul acordului.

### S8 · Evidența contractului de înscriere

S5 produce documentele care privesc **vizitatorul**: confidențialitate, termeni de site, cookie-uri.
Contractul dintre școală și familie e altceva, și trei epicuri se sprijină pe el:
[E12](E12-prezenta-orar.md) spune că un părinte cumpără participarea la un modul, nu un număr
garantat de ședințe, și că „formularea din factură și din termeni trebuie să reflecte asta";
[E15](E15-pricing-facturare.md) decide „fără returnare la abandon", care e o clauză contractuală, nu
o setare de sistem; [E11](E11-inscrieri-capacitate.md) leagă înscrierea de o grupă anume.

**Contractul se semnează fizic.** Platforma nu ține textul, nu îl versionează și nu capturează
acceptare digitală. Face un singur lucru: reține că pentru o înscriere **există contract semnat** —
data semnării și, dacă textul ajunge să aibă versiuni, care versiune. Câteva câmpuri pe înscrierea
din [E11](E11-inscrieri-capacitate.md), nu un subsistem de documente.

Motivul e că nu mai e nimic de capturat online. Nu există auto-înscriere: contul de părinte e inactiv
până îl aprobă un admin, iar copilul e înscris în grupă tot de admin. Deci e mereu cineva în cameră
când se semnează, iar hârtia se obține la fel de ușor ca o bifă. Ținut în platformă, textul ar fi
cerut mecanica de versionare din S5, un ecran de acceptare, dovada acceptării și, la prima
modificare, întrebarea ce se întâmplă cu familiile care au acceptat versiunea veche — muncă al cărei
rezultat îl dă deja dosarul.

Ce rezolvă câmpurile e o altă problemă, mai mică și reală: azi „a semnat familia X?" cere să caute
cineva prin bibliorafturi, deci la câteva zeci de familii nimeni nu verifică preventiv și se află la
momentul prost. Cu evidența în platformă, o înscriere fără contract se vede în listă, lângă ea.

Intră în exportul din S4 — un părinte care cere ce dețineți despre el află și că aveți înregistrat
faptul că a semnat, cu data. Copia textului i-o dă școala din dosar; platforma nu o are.

Textul îl scrie și îl validează un avocat, ca restul documentelor legale, deci rămâne în afara
scopului. Nu există acceptare digitală, deci nu se pune nici întrebarea despre semnătură electronică
calificată.

**Drepturile de imagine nu se redublează aici.** Ce e de consimțit — publicarea lucrării — stă în
consimțământul granular din S2, revocabil dintr-un click. Ca clauză în contractul de pe hârtie,
retragerea acordului ar fi arătat ca o modificare de contract, iar retragerea trebuie să fie la fel
de ușoară ca acordarea.

**Acceptanță:** pentru orice înscriere se poate spune, din platformă, dacă există contract semnat și
din ce dată, fără să deschidă cineva un biblioraft. O înscriere fără contract se vede în listă.

**Nu blochează nimic din [E11](E11-inscrieri-capacitate.md).** Singura situație în care acceptarea ar
fi trebuit capturată digital era auto-înscrierea din portal, fiindcă acolo nu mai e nimeni în cameră.
Nu se face — vezi [Decizii luate](#decizii-luate).

**Livrat — jumătate de E11, jumătate aici.** Coloana `Enrollment.contractSignedAt` a venit cu E11 S1
și se completa la înscriere (`POST /enrollments`) și la confirmarea probei (`PUT
/enrollments/:id/resolve-trial`), iar fișa copilului o arăta când exista. Ce lipsea era exact
acceptanța: **o înscriere fără contract nu se vedea nicăieri**, iar pentru cele câteva zeci de
înscrieri la care nimeni n-a tastat data atunci nu exista nicio ușă de consemnat după. Acum:

- `PUT /enrollments/:id/contract` consemnează ziua de pe hârtie pe orice înscriere care nu e probă;
  `null` șterge o dată greșită. **Proba e refuzată** (`TRIAL_HAS_NO_CONTRACT`): e gratuită și n-are
  contract, iar o dată pe ea ar spune că familia s-a angajat înainte să decidă — se confirmă proba
  întâi, ușa aceea ia și data. O zi din viitor e refuzată (`CONTRACT_DATE_IN_FUTURE`).
- `GET /enrollments/without-contract` e lista: înscrierile **active** fără nimic consemnat, cele mai
  vechi primele, cu copilul, familia (telefon, email) și grupa. Doar active: proba n-are contract prin
  construcție, iar o înscriere închisă e istorie — familia a plecat, dosarul e dosarul.
- Se vede în trei locuri: `/admin/contracte`, o listă cu câte un câmp de dată și un buton pe rând;
  fișa copilului, unde înscrierea activă fără contract spune „Fără contract — consemnează" în loc să
  tacă; pagina grupei, unde copilul poartă insigna „Fără contract". Tabloul de bord numără
  (`Overview.enrollmentsWithoutContract`), cerut de la `EnrollmentService.withoutContract`, nu
  numărat acolo.

Ce nu s-a construit, prin decizia de mai sus: versiunea textului. Contractul n-are încă versiuni, deci
un câmp pentru ele ar fi liber să fie completat cu orice. Se adaugă în ziua în care avocatul dă a doua
versiune. Exportul din S4 va include faptul și data, când S4 va exista.

## Dependențe

[E04](E04-migrari-date.md) pentru schema de consimțământ și audit,
[E05](E05-robustete-backend.md) pentru filtrarea datelor din loguri.

**Ce blochează E07, blochează la nivel de story.** Niciun epic de mai jos nu așteaptă E07 ca să
înceapă; fiecare are câte un story care nu se poate bifa fără unul de aici:

- [E14](E14-proiecte-elevi.md) — vitrina publică nu poate arăta nimic fără consimțământul din S2.
- [E19](E19-seo-geo.md) S8 — analiza de trafic respectă bannerul din S5.
- [E09](E09-personal-roluri.md) S2 — **muchie suspendată, nu desființată.** Exista fiindcă rolul de
  profesor lărgea accesul la datele de contact ale părinților, iar decizia era apărabilă doar
  însoțită de jurnalul din S3. Nu se mai implementează rolul: profesorul e admin și vede tot prin
  rol, nu printr-o excepție, deci nu se lărgește niciun acces și nu se cere nicio urmă în plus. E09
  spune același lucru din partea cealaltă, în „Dependențe". Redevine blocantă în ziua în care se reia
  E09 S2, cu motivul neatins: un jurnal pornit după nu reconstituie accesele deja făcute, deci S3 se
  livrează odată cu S2, nu după.

Dintre astea, doar [E14](E14-proiecte-elevi.md) are E07 în coloana „Depinde de" a tabelului din
[README](README.md): acolo consimțământul e precondiție de model, nu criteriu de acceptanță — fără el
epicul nu are ce livra. Celelalte sunt muchii slabe, de același fel cu cele care pleacă din
[E17](E17-comunicare-notificari.md) către E11, E12 și E16: epicurile se construiesc și se livrează
fără E07, doar că rămân cu criterii nebifate. Locul lor e aici, în `Blochează`, și în graful din
README — nu în coloana „Depinde de" — ca să nu fie descoperite ca surpriză la sfârșitul epicului
blocat.

**[E11](E11-inscrieri-capacitate.md) nu e în listă, iar acum e definitiv.** Muchia ar fi apărut doar
prin auto-înscrierea din portal, unde acceptarea contractului ar fi trebuit capturată digital. Nu se
face auto-înscriere: fiecare cont și fiecare înscriere trec printr-un admin. Evidența din S8 e un
câmp pe înscrierea făcută de admin, nu o precondiție pentru ea.

## Riscuri

**Consimțământul adăugat după ce proiectele sunt deja publicate e mult mai scump.** Trebuie
construit _înainte_ de [E14](E14-proiecte-elevi.md), nu retrofitat. E motivul pentru care acest
epic apare în pista de fundație și nu la sfârșit.

**Retenția contabilă intră în conflict cu dreptul la ștergere.** Facturile trebuie păstrate ani de
zile; datele personale trebuie șterse la cerere. Rezolvarea e anonimizarea, nu ștergerea, și
trebuie proiectată explicit.

## Definition of done

Fiecare categorie de date personale are temei legal și termen de păstrare. Consimțământul e
granular, revocabil și respectat automat. Pentru orice înscriere se știe, din platformă, dacă există
contract semnat, din ce dată și în ce versiune. Un audit extern ar găsi documentație, nu
improvizație.

## Decizii luate

**Se fotografiază lucrarea, nu copilul.** Regulă tare de la bun început, nu avertisment în procedură:
fără fețe, fără copii în cadru. Din ea decurg două lucruri. Al cincilea scop de consimțământ propus
mai devreme — fotografierea copilului la curs — a ieșit din S2, fiindcă nu mai are obiect: nu se
consimte un act care nu se produce. Și problema copilului din fundal — poza unei lucrări care prinde
în trecere copilul altei familii — dispare structural, nu prin verificare manuală înainte de
publicare.

**Fără detecție automată de fețe și fără blurare.** Ar fi răspunsul reflex la problema de mai sus, și
ar fi fost greșit și atunci când problema exista. Un model de detecție ar rula pe aceeași instanță
care ține și Postgres — vezi [E01](E01-infrastructura-medii.md) — pentru câteva zeci de fotografii pe
săptămână, și ar rata exact cazurile grele, un profil parțial în penumbră, deci ar produce încredere
falsă tocmai acolo unde ochiul omului ar fi contat. Soluția ieftină e să nu existe fața în cadru. Se
reia discuția doar dacă regula de fotografiere se schimbă.

**Livrarea e privată.** Proiectul și emailul declanșat de admin din [E14](E14-proiecte-elevi.md) ajung
exclusiv la părintele copilului respectiv; nimic nu pleacă spre alte familii. De aceea „partajarea proiectului
cu ceilalți părinți din grupă" a ieșit din lista de scopuri din S2 — un consimțământ pentru o
difuzare care nu se face rămâne, totuși, un câmp de cerut, de stocat și de verificat.

**Contractul de înscriere se semnează pe hârtie.** Platforma reține faptul, data și, dacă e cazul,
versiunea — nu textul și nu acceptarea. Vezi S8.

**Nu există rol de profesor, deci E07 nu mai blochează E09 azi.** Cei doi oameni care predau sunt
proprietarii școlii și au rol de admin; rolurile `TEACHER` și `LOCATION_MANAGER` nu se implementează
acum. Cade odată cu ele și decizia „profesorul vede datele de contact complete ale părinților din
grupele lui", care era singurul motiv pentru care [E09](E09-personal-roluri.md) S2 avea nevoie de
jurnalul din S3: nu se consemnează un acces în plus care nu se acordă nimănui. S3 rămâne în scop din
celelalte motive din [Problemă](#problemă) — o factură modificată fără urmă e independentă de cine
predă. Se reia, cu dependență cu tot, la primul profesor care nu e proprietar.

**Fără drept de retragere în 14 zile.** Termenii din S5 nu trebuie să acopere OUG 34/2014, cum se
scrisese aici mai devreme, fiindcă nu se mai încheie contract la distanță: nu există auto-înscriere,
contul de părinte se aprobă de admin, copilul e înscris de admin, iar contractul se semnează față în
față. Regula „fără returnare la abandon" din [E15](E15-pricing-facturare.md) rămâne o clauză
contractuală obișnuită, de validat de avocat ca oricare alta, nu o derogare de la un drept legal.
Întrebarea se repune în clipa în care apare înscriere sau plată online fără contract semnat înainte —
atunci contractul redevine încheiat la distanță, iar corectura trebuie făcută _înainte_ de
redactarea termenilor, nu după.

## Întrebări deschise

- Cine e responsabilul cu protecția datelor? La dimensiunea asta nu e obligatoriu un DPO formal,
  dar cineva trebuie să fie punctul de contact.
- Vârsta de la care copilul însuși are drepturi de acces? În România, consimțământul digital e la 16
  ani, dar copiii școlii sunt sub. Deci contul e mereu al părintelui.

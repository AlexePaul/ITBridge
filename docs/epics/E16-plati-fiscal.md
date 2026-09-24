# E16 · Încasări și facturare prin SmartBill

**Status:** în lucru — S1 și S7 livrate; S0, S2, S3, S5 și S6 construite și testate pe un SmartBill fals, fără contact încă cu contul real · **Pistă:** Bani · **Depinde de:** E15 · **Blochează:** E21

## Problemă

`Payment` are patru câmpuri: `id`, `invoice`, `method` cu valoarea implicită `'cash'`, și `date`.

**Nu are sumă.** Nu are referință de tranzacție, nu are stare, nu are cine a înregistrat-o. Relația
cu `Invoice` e unu-la-unu.

Consecințele:

- **Plata parțială e imposibilă de reprezentat.** Un părinte care aduce 300 din 350 nu are unde să
  fie consemnat. (Motivul scris inițial aici — planul în două tranșe din
  [E15](E15-pricing-facturare.md) — a dispărut odată cu S3; consecința nu, fiindcă numerarul o
  produce oricum.)
- **Nu se poate verifica nimic.** O plată nu poate fi confruntată cu un extras bancar, pentru că nu
  are nici sumă, nici referință.
- **Metoda e text liber, fără sumă în spate.** `method` e `varchar(100)` cu implicit `'cash'`.
  Numerarul și transferul rămân, prin decizie, singurele metode — vezi
  [Decizii luate](#decizii-luate) — dar înregistrarea lor manuală trebuie să însemne mai mult decât
  un rând care spune „cash" și o dată.
- **Nu există chitanță.** Părintele nu primește nicio confirmare automată.
- **Nu există urmărirea restanțelor.** `InvoiceStatus.OVERDUE` există în enum, dar nimic nu îl
  setează.

Pe partea fiscală, platforma generează astăzi PDF-uri cu PDFKit și le urcă în S3 — documente care
**nu sunt facturi în sens fiscal**: fără serie și număr gestionate corect, fără date de emitent,
fără TVA, fără nicio legătură cu ANAF.

## Decizie: SmartBill e sistemul de evidență fiscală

Platforma **nu emite facturi**. Calculează ce se datorează și cere SmartBill să emită documentul.

Împărțirea responsabilităților, care ar trebui respectată strict:

|                                         | Platforma | SmartBill |
| --------------------------------------- | --------- | --------- |
| Ce se datorează, cui, pentru ce modul   | ✓         |           |
| Scadențe și starea plății               | ✓         |           |
| Afișare pentru părinte, istoric, portal | ✓         |           |
| Serie și număr de factură               |           | ✓         |
| PDF-ul fiscal                           |           | ✓         |
| TVA și date de emitent                  |           | ✓         |
| Transmitere în SPV pentru e-Factura     |           | ✓         |
| Evidența contabilă și exportul          |           | ✓         |

Platforma păstrează propria entitate `Invoice` — are nevoie de ea pentru portal, tranșe și
rapoarte — dar aceasta stochează **referința** către documentul SmartBill: serie, număr, id și
link la PDF. Sursa de adevăr fiscală e la ei.

Ce iese din scop față de forma inițială a epicului: gestionarea seriilor și numerelor, calculul
TVA, integrarea directă cu ANAF, și generarea PDF-ului de factură. Toate sunt rezolvate de SmartBill.

## Ce trebuie știut despre API

Verificat în [documentația lor](https://api.smartbill.ro/) și în
[ghidul de integrare](https://ajutor.smartbill.ro/article/196-integrare-api) — iar din septembrie
2026 **în specificația OpenAPI pe care o publică SmartBill** (actualizată pe 17 septembrie 2026),
pe care s-a construit S2. Unde spec-ul și ce e scris mai jos se contrazic, spec-ul are dreptate:

- **Cere abonament Facturare Platinum.** E o constrângere comercială, nu tehnică, și trebuie
  confirmată **înainte** de orice altceva din acest epic.
- **REST, JSON, HTTP Basic Auth** cu email plus token. V1, la `https://ws.smartbill.ro/SBORO/api`,
  pentru facturare și încasări; V3 are doar nomenclatoare (clienți, produse, cote TVA), cu token
  Bearer, deci nimic din epicul ăsta nu-l folosește.
- **Limită de 30 de apeluri la 10 secunde, per token.** Depășirea blochează accesul 10 minute.
  Spec-ul spune 429; o bibliotecă care rulează contra API-ului real consemnează că blocarea vine ca
  **403** cu `errorText` „Ai depasit limita maxima de requesturi", iar platforma le recunoaște pe
  amândouă. Determină direct designul emiterii în masă — vezi S3.
- **`errorText` e adevărul, nu codul HTTP.** Gol înseamnă reușită; completat înseamnă refuz, chiar
  și pe un 200. Poate conține HTML — `<b>` în jurul numelui, `<br/>` înaintea unui sfat.
- **Nu există sandbox.** Orice factură emisă prin API e un document fiscal real. Ce există e
  **ciorna** (`isDraft: true`): „fara numar alocat pana la finalizarea manuala" — nu consumă
  numărul seriei, nu pleacă în SPV. Pe ea stă S0.
- **Nu există cheie de idempotență.** O cerere al cărei răspuns s-a pierdut nu poate fi întrebată
  dacă a devenit factură; seria, în schimb, poate — `nextNumber` din `GET /series`. Pe asta stă S2.
- `documentViewUrl` din răspuns e un link public către PDF, „il trimiti clientului final fara sa
  necesite autentificare". PDF-ul prin API se cere cu `Accept: application/octet-stream`:
  `application/pdf` e singura valoare care răspunde 406, iar o factură inexistentă e un 502 cu
  pagină nginx, nu o eroare citibilă.
- Operații disponibile: emitere de facturi, ștergere și anulare, acces la PDF, proforme
  convertibile în facturi, **încasări pe o factură** (deci plata parțială e suportată nativ),
  trimitere de documente pe email, gestiunea clienților și produselor.
- **e-Factura:** cu modulul activ, SmartBill trimite XML-ul în SPV după emitere. Nu gestionăm
  nici XML, nici semnături, nici termene.
- Suportul pentru API se face **doar pe email** — `api@smartbill.ro`, după spec-ul din septembrie 2026. Merită luat în calcul la estimare: o întrebare de integrare nu se rezolvă în cinci minute.

## Decizii luate

~~**Plata în tranșe produce două facturi, nu o factură cu două încasări.**~~ **Fără obiect:**
[E15](E15-pricing-facturare.md) S3 e scos, fiindcă factura lunară e deja plata în tranșe. Nu există
suma de 700 pe modul care să se rupă în două, deci nici alegerea părintelui la înscriere, nici al
doilea document fiscal. Ce urmează rămâne adevărat pentru **factura lunii**, care e una singură.

Consecințe pentru integrare:

- **A doua factură se emite la mijlocul modulului**, printr-un job programat, nu odată cu prima.
  Decurge din regula de abandon: cine pleacă la jumătate nu primește a doua factură, deci nu e
  nimic de stornat. Prețul e că jobul devine critic — dacă nu rulează, nu se facturează. Intră sub
  alertare în [E06](E06-observabilitate-operare.md).
- **Volumul de apeluri se dublează** față de varianta cu o singură factură. Cu limita de 3 pe
  secundă, contează la emiterea în masă din S3.
- **Nu se folosesc încasări parțiale** pe o factură. Fiecare factură se încasează integral, ceea ce
  simplifică S1: starea unei facturi e plătită sau nu, iar plata parțială există doar la nivelul
  notei de plată din [E15](E15-pricing-facturare.md).
- **Proformele nu se folosesc.** Ar fi fost o alternativă pentru tranșa a doua, dar adaugă un tip
  de document fără să rezolve ceva ce nu rezolvă deja emiterea programată.

**Părintele primește factura și plătește cum îi convine: transfer bancar sau numerar.** Nu se alege
în locul lui și nu se împinge nicio metodă. Platforma înregistrează, deci, încasări de două feluri,
iar potrivirea lor cu facturile e **manuală**: banii intră în cont sau în casierie, iar cineva
bifează în platformă că au intrat. Nu există niciun sistem care să confirme asta singur.

Consecințe, în ordinea în care lovesc:

- **S5 nu mai e ramura secundară de lângă plata online, e singurul drum prin care o factură ajunge
  plătită.** Ce era acolo „un singur loc de introducere, nu două" devine calea critică a epicului și
  se scrie ca atare: dacă ecranul de încasare e incomod, evidența plăților se mută înapoi într-un
  fișier, iar starea facturilor din platformă devine ficțiune.
- **`Payment.method` e azi `varchar(100)` cu implicit `'cash'`, text liber** — vezi
  `apps/api/src/entities/payment.entity.ts`. Devine o listă închisă, cu exact două valori acum
  (`cash`, `bank_transfer`), extensibilă mai târziu fără migrare de date. Text liber înseamnă că
  „transfer", „Transfer", „OP" și „banca" ajung patru metode diferite în orice raport din
  [E21](E21-raportare-analytics.md).
- **Momentul plății nu mai e garantat de nimic tehnic.** Cu plata online, factura se stinge în
  secunda în care părintele apasă; aici se stinge când cineva se uită în extras. Urmărirea
  restanțelor din S7 nu e o rafinare, e compensarea acestei întârzieri.
- **Numerarul face posibilă fizic o plată parțială**: un părinte poate aduce 300 din 350. Modelul
  refăcut la S1 o suportă — `Payment` primește sumă, relația devine mulți-la-unu, iar starea
  facturii se va deriva din suma plăților — dar rămâne o excepție tratată, nu un plan oferit.
  Împărțirea sumei **nu** se mai face prin planul în tranșe: [E15](E15-pricing-facturare.md) S3 e
  scos, iar factura lunară e deja bucata mică. O plată parțială rămâne exact ce spune rândul de mai
  sus — o excepție tratată de model, nu un plan oferit.

**Datele de facturare cerute de SmartBill sunt numele și adresa. Fără CNP.** Răspunsul închide
jumătatea care aștepta contabilul, iar consecințele merg în patru direcții:

- **[E11](E11-inscrieri-capacitate.md) S2 rămâne așa cum e scris.** Lista de acolo — nume, prenume,
  email, telefon, adresă, contact de urgență — acoperă deja cerința, deci formularul de înregistrare
  nu se rescrie și nu trebuie recontactată nicio familie deja înregistrată.
- **Nu se colectează CNP nicăieri.** Nu e doar un câmp în minus: CNP-ul își aduce propriile obligații
  de temei, minimizare și retenție în [E07](E07-securitate-gdpr.md), iar acum nu mai există niciun
  motiv să existe discuția. Dacă cineva propune vreodată câmpul, îl propune cu o cerință scrisă în
  spate, nu „pentru facturi".
- **Ce rămâne de decis nu mai e o dată cerută părintelui**, ci forma în care se trimite adresa:
  `Profile.address` e azi un singur `varchar(255)` text liber, iar dacă API-ul cere stradă, oraș,
  județ și cod poștal separat, despărțirea se face la S2, în platformă. E o schimbare de schemă
  internă, nu un câmp nou pe formular.
- **Răspunsul acoperă SmartBill, nu și SPV-ul.** Sunt două praguri diferite și pot să nu coincidă:
  ce acceptă API-ul la crearea clientului nu e neapărat ce trece la transmiterea XML-ului în SPV,
  iar al doilea pas nu se vede de aici — îl face SmartBill, după emitere. Nu e motiv să se colecteze
  nimic preventiv, dar dacă un document e respins la transmitere, întrebarea se redeschide exact în
  punctul ăsta, pentru partea de e-Factura, nu de la zero.

## În scop

- Refacerea modelului de plată.
- Integrarea cu SmartBill pentru emitere și încasări.
- Încasarea în numerar și prin transfer bancar, înregistrată de admin.
- Chitanțe și confirmări automate.
- Urmărirea restanțelor cu memento-uri.
- Reconciliere.

## În afara scopului

- Prețuri și structura facturii — vezi [E15](E15-pricing-facturare.md).
- Tot ce preia SmartBill: numerotare, TVA, e-Factura, PDF fiscal, export contabil.
- **Plata cu cardul în portal.** Amânată, nu abandonată — motivul și condiția în care se reia, la S4.

## Story-uri

### S0 · Verificarea premisei

Înainte de orice cod: se confirmă că abonamentul permite acces API, se obține tokenul, și se face
o emitere de test într-un mediu de probă. Dacă abonamentul actual nu e Platinum, costul upgrade-ului
intră în decizie acum, nu după ce s-a construit integrarea.

**Acceptanță:** o factură de test emisă prin API apare în contul SmartBill, cu serie și număr
corecte.

**Stare: deblocat, cu unealta livrată.** Contul SmartBill există (septembrie 2026). Ce a schimbat
planul e un fapt al lor, nu al nostru: **SmartBill nu are sandbox**, deci „o factură de test emisă
prin API" ar fi o factură reală — ar lua următorul număr din serie, ar pleca în SPV cu e-Factura
activă și ar trebui stornată. Acceptanța se ține altfel, cu aceleași trei răspunsuri și fără
niciun document fiscal:

- **`pnpm smartbill:check`** doar citește: cotele de TVA (`GET /tax`) și seriile (`GET /series`).
  Un token care merge, un CIF pe care tokenul îl vede și o serie care există — cu numărul pe care
  l-ar primi prima factură — sunt tot ce voia să afle testul, iar niciunul nu cere o factură. Pică
  pe o serie lipsă sau pe o cotă TVA configurată care nu există în cont.
- **`pnpm smartbill:check --draft`** trimite **o singură ciornă**, pentru o familie inventată; cu
  `--invoice 412`, ciorna poartă exact cererea pe care coada ar trimite-o pentru factura 412. O
  ciornă n-are număr și nu e document fiscal: se deschide din linkul tipărit, se verifică denumirea,
  suma, TVA-ul și mențiunile, apoi se șterge din SmartBill Cloud. E privirea pe care ar fi dat-o
  sandbox-ul.
- **Numărul e verificat de serie, nu de o factură.** Unealta tipărește `nextNumber`, iar prima
  factură reală se emite pe el — o familie reală, o lună reală, cu cineva care se uită.

Ce mai e de făcut **nu e cod** și e al patronului, în ordinea asta: tokenul (din SmartBill Cloud,
`Contul Meu > Integrări > API`) și CIF-ul în `.env` local, apoi `pnpm smartbill:check`; **o serie
nouă de facturi, doar a platformei** — de ce, la S2; cota de TVA stabilită cu contabilul, scrisă ca
`SMARTBILL_TAX_NAME` și `SMARTBILL_TAX_PERCENTAGE`, sau nimic pentru o școală neplătitoare de TVA;
o ciornă cu `--draft --invoice`, privită și ștearsă. Pe stage, aceleași credențiale merg în
Parameter Store, lângă `SMARTBILL_MODE=draft` și `NODE_ENV=stage`: stage n-are voie la mai mult de
ciorne (S2).

**Rămâne neverificat de nimic automat: e-Factura.** O ciornă nu pleacă în SPV, deci ce acceptă SPV
pentru o persoană fizică se vede abia la prima factură reală. Adresa trimisă e `Profile.address`,
un singur text liber — fără județ și localitate separate. Dacă SPV o respinge pentru asta,
întrebarea din [Decizii luate](#decizii-luate) („despărțirea se face la S2, în platformă") se
redeschide exact acolo: două câmpuri noi pe profil, nu o ghicire în text.

### S1 · Modelul de plată refăcut

`Payment` devine: factură, **sumă**, dată, metodă, referință externă, referință SmartBill a
încasării, stare (`inițiată`, `reușită`, `eșuată`, `stornată`), cine a înregistrat-o, observații.
Relația cu `Invoice` devine **mulți-la-unu**.

Metoda e o listă închisă, nu text liber: `cash` și `bank_transfer`, atât. Referința externă e
numărul ordinului de plată sau al chitanței de casă — singurul lucru după care o încasare se poate
regăsi într-un extras, deci și în S8. Stările își păstrează rostul chiar fără procesator de plăți:
propagarea în SmartBill poate eșua, iar o încasare înregistrată în platformă și neajunsă acolo
trebuie să se vadă ca atare, nu să pară reușită.

`Invoice` primește câmpurile de legătură cu SmartBill: serie, număr, id document, link PDF, stare
de sincronizare.

Starea facturii se derivă din suma plăților reușite față de total — nu se setează manual.

**Acceptanță:** o factură de 350 cu o plată de 350 e `plătită`. O notă de plată de 700 cu prima
factură încasată și a doua neemisă arată `parțial achitată`, cu restul afișat. Plata parțială
există la nivel de notă, nu de factură.

**Livrat**, cu o tăietură deliberată: partea de plată în întregime, partea de SmartBill deloc.

`Payment` are acum sumă (`decimal`, prin `decimalAsNumber`), metodă ca enum închis (`cash`,
`bank_transfer`), stare (`initiated`, `succeeded`, `failed`, `reversed`), referință externă —
numărul OP-ului sau al chitanței, singurul lucru după care o încasare se regăsește în extras —,
observații, cine a înregistrat-o și `createdAt`. Relația cu `Invoice` e mulți-la-unu: FK-ul s-a
mutat de pe `invoices.payment_id` pe `payments.invoice_id`, iar migrarea cară legăturile existente
și umple suma din totalul facturii — sub modelul vechi, un rând de plată însemna exact „plătită
integral", deci totalul e ce a susținut rândul dintotdeauna.

**Starea facturii e derivată, cu un singur scriitor** — același tipar ca `Child.group`:
`PaymentService.recomputeInvoiceStatus` adună plățile `succeeded` și compară cu totalul, în aceeași
tranzacție cu scrierea care o provoacă. Acoperit înseamnă `paid`; neacoperit înseamnă ce era înainte
să intre banii — `overdue` rămâne `overdue`, fiindcă întârzierea e un fapt despre calendar, nu
despre sold. `waived` nu e atins niciodată, iar o plată pe o factură `waived` e refuzată cu
`INVOICE_WAIVED`: banii apăruți pe o lună la care școala a renunțat sunt semn că s-a ales rândul
greșit. O plată parțială lasă factura în așteptare — 100 din 350 nu e „plătită", care era exact
bug-ul modelului vechi, unde existența rândului marca factura.

**Cine a înregistrat-o trece pe sârmă doar ca `id` și `username`.** `User.passwordHash` n-are
`select: false`, deci un `leftJoinAndSelect` pe relație ar fi publicat hash-ul fiecărui admin
oricărui părinte cu o plată. Join-ul e gol plus `addSelect` numit, iar un test de integrare ține
exact forma răspunsului: două chei, niciuna în plus.

**Ce NU e în S1, deliberat:** câmpurile de legătură ale facturii cu SmartBill (serie, număr, id
document, link PDF, stare de sincronizare). Ele aparțin integrării, iar S0 cere verificarea
abonamentului **înainte de orice cod SmartBill** — coloane moarte scrise acum ar fi trebuit ghicite
și probabil rescrise la S2. `Payment.smartbillReference` există deja, fiindcă e un varchar nullable
pe entitatea oricum rescrisă, nu o schemă inventată în avans. Nota de plată din acceptanță ține de
factura pe modul (E15 S2, abandonată); în modelul pe lună, „parțial achitată" trăiește la nivel de
factură, prin suma plăților față de total.

### S2 · Emiterea prin SmartBill

La confirmarea emiterii din [E15](E15-pricing-facturare.md) S6, platforma trimite documentul către
SmartBill și stochează referința primită. PDF-ul nu se mai generează local.

Tratarea eșecurilor contează mai mult decât cazul fericit: o factură care a eșuat la SmartBill nu
trebuie să rămână „emisă" în platformă, iar o reîncercare nu trebuie să producă document dublu.
Deci fiecare emitere are cheie de idempotență proprie și stare de sincronizare explicită.

**Acceptanță:** o eroare de rețea la mijlocul emiterii nu produce nici factură fantomă în
platformă, nici document dublu în SmartBill.

**Construit și testat pe un SmartBill fals; neatins încă pe contul real.** Factura se scrie în
platformă ca până acum, dintr-o singură apăsare pe `/admin/invoices/emitere`, iar în aceeași
tranzacție primește `fiscalStatus = pending`. Documentul fiscal îl face după aceea
`FiscalIssuingService`, dintr-un ceas de 30 de secunde, **nu din cererea care emite**: apăsarea nu
așteaptă după SmartBill, iar un SmartBill picat nu desface luna. Cinci decizii:

- **Trei moduri, iar implicitul nu trimite nimic.** `SMARTBILL_MODE=off` emite exact ca înainte, cu
  PDF-ul local; `draft` trimite fiecare factură drept ciornă — sandbox-ul pe care SmartBill nu-l
  are, cu contul adevărat și fără nimic de stornat —; `live` emite facturi reale. **`live` nu
  pornește decât dintr-un backend de producție și pe baza lui**: cere `NODE_ENV=production` și
  `SMARTBILL_LIVE_DB` egal cu numele bazei (`DB_NAME`). A doua condiție e regula lui
  `SEED_ALLOW_NON_LOCAL`: un „da" rămas într-un fișier de mediu autorizează orice bază lângă care e
  copiat, iar baza de pe stage e seed, cu familii care ar primi fiecare câte o factură fiscală.
  Prima a venit după, la cererea patronului (septembrie 2026), fiindcă a doua singură nu ține
  stage-ul departe: un fișier de stage cu `live` și numele propriei baze trece de ea — două setări
  SmartBill, tastate în aceeași după-amiază de cine încearcă SmartBill. `NODE_ENV` descrie tot
  backend-ul, nu SmartBill-ul, deci **stage rulează cu `NODE_ENV=stage` și trimite cel mult
  ciorne**. Regula e una, `mayIssueFiscalDocuments`, verificată la pornire, de coadă înainte să
  revendice un rând și la ușa prin care trece orice cerere, `SmartBillService.issueInvoice`.
- **Cheia de idempotență pe care o cerea story-ul nu există la SmartBill, deci proba e seria.**
  Înainte de cerere, `nextNumber` e scris pe rând (`fiscalExpectedNumber`); rândul trece în
  `uncertain` **înainte** de apel, deci un proces mort la jumătate lasă exact starea asta. Un răspuns
  pierdut se judecă după ce expiră un „împrumut" de două minute, recitind seria: **seria n-a mișcat
  → nu s-a emis nimic → se retrimite; seria a mișcat → o decide un om.** Platforma nu adoptă
  niciodată un număr fiscal pe care nu l-a văzut venind înapoi: starea `review` spune „probabil
  numărul 41", iar adminul confirmă numărul din SmartBill sau spune că nu e acolo, dintr-un buton pe
  `/admin/invoices/[luna]`. Ambele uși sunt consemnate în jurnalul de audit.
- **O singură cerere în aer, iar nimic nu pleacă peste una fără răspuns.** Altfel seria s-ar mișca
  sub rândul care așteaptă să fie judecat după ea. De aici și cerința pentru patron: **seria e a
  platformei.** O factură tastată de mână pe aceeași serie mișcă numărul și transformă o cerere care
  n-a ajuns niciodată într-o întrebare pentru un om — sigur, dar inutil.
- **Un refuz nu se reîncearcă singur.** SmartBill a înțeles și a zis nu — o serie lipsă, o cotă TVA
  pe care contul n-o are —, deci aceeași cerere primește același nu. Rândul intră în `failed` cu
  propoziția lor, curățată de HTML; cineva repară cauza și apasă „Retrimite". Un token greșit sau un
  drept lipsă pe serie **nu consumă încercarea**, lecția pe care coada de mail a plătit-o: un eșec de
  configurare care arde încercări își îngroapă singur coada înainte să ajungă reparația.
- **O linie, la suma calculată de platformă.** Nu prețul de listă cu linii de reducere dedesubt,
  deși SmartBill le are: un `discountValue` pozitiv _crește_ totalul, o linie fără `numberOfItems`
  e ignorată cu 200, iar cu prețul cu TVA inclus aritmetica ar fi a lor. Promisiunea din
  [E15](E15-pricing-facturare.md) S7 e că portalul și SmartBill se potrivesc la leu, iar o linie la
  `amount` o face adevărată prin construcție. Reducerea rămâne pe document, în mențiuni, în cuvinte.
  Din familie pleacă **numele și adresa, nimic altceva** — nici email, nici telefon —, iar
  `sendEmail` e fals: familia aude de la platformă, prin coadă, nu pe un al doilea canal pe care
  `/admin/livrari` nu-l vede.

**Ce s-a schimbat în jurul facturii.** Una emisă în SmartBill — sau care poate fi — nu mai poate fi
ștearsă și nu-și mai schimbă suma sau data din platformă (`INVOICE_HAS_FISCAL_DOCUMENT`): corectura
e o stornare în SmartBill. Starea rămâne editabilă, fiindcă e a platformei. Și a ieșit la iveală un
defect care ar fi produs exact documentul dublu: `updateInvoice` salva **tot rândul**, citit înaintea
tranzacției, iar `save` din TypeORM scrie înapoi fiecare coloană care diferă — deci o factură emisă
între citire și salvare s-ar fi întors în coadă și ar fi fost emisă a doua oară. Acum scrie doar
câmpurile trimise.

**PDF-ul, în `live`, e al lor** — jumătatea din [E15](E15-pricing-facturare.md) S7: platforma nu mai
generează nimic cu PDFKit, iar după emitere ia PDF-ul fiscal de la SmartBill și îl pune **la aceeași
cheie** din bucket, `invoicePdfKey`. Descărcarea din portal, exportul din E07 S4 și ștergerea îl
citesc de acolo fără să știe cine l-a făcut. Dacă preluarea pică, se reîncearcă la prima descărcare.
În `off` și `draft` rămâne PDF-ul local: o ciornă nu e factură.

**Acceptanța, ținută de `smartbill-issuing.e2e-spec.ts`**, pe bază reală și pe un SmartBill fals
care vorbește HTTP — fiindcă un `fetch` înlocuit nu poate pierde un răspuns după ce a scris
factura: răspuns pierdut după emitere → `review`, un singur document; răspuns pierdut înainte →
retrimis o dată; serie mișcată de altcineva → niciun număr ghicit; refuz → `failed`, apoi emisă la
retrimitere; blocare → nimic trimis zece minute, nicio încercare consumată.

### S3 · Emiterea în masă, temperată

Cu 3 apeluri pe secundă și blocare de 10 minute la depășire, emiterea pentru ~100 de familii **nu
poate fi o buclă**. Se face prin coadă, cu limitare sub prag, reîncercare cu pauză crescătoare, și
progres vizibil în interfață.

La 3 pe secundă, 100 de facturi înseamnă minim ~34 de secunde. Cu marjă de siguranță, se planifică
2 pe secundă.

Coada nu se construiește aici: e cea din [E17](E17-comunicare-notificari.md) S3, iar ce adaugă S3-ul
ăsta e limitarea de rată și progresul în interfață. Vezi [Dependențe](#dependențe).

**Acceptanță:** emiterea pentru 100 de familii se termină fără blocare de acces și raportează
individual ce a eșuat.

**Construit odată cu S2, pe aceleași rânduri.** Limita reală e de 30 de apeluri la 10 secunde, nu 3
pe secundă; clientul lasă **cel puțin 400 ms între două apeluri**, oricine le face — ceasul și un
admin care deschide un PDF împart același token —, adică cel mult 25 în zece secunde. O trecere ia
cel mult 20 de facturi, câte una: o citire a seriei, o cerere pe factură, un PDF pe factură emisă —
vreo 16 secunde. **O sută de familii înseamnă cinci treceri, două minute și jumătate, și nu
așteaptă nimeni după ele.** La blocare, procesul nu mai sună SmartBill deloc zece minute — nici o
citire —, iar factura întoarsă își păstrează încercarea.

**Coada nu e cea din [E17](E17-comunicare-notificari.md) S3**, cum spunea textul de mai sus, scris
înaintea ei. E mecanismul ei — revendicare cu `FOR UPDATE SKIP LOCKED`, un singur proces, pauză
crescătoare — dar nu tabela: acolo un rând e un mesaj cu destinatar, subiect și corp, iar un rând
care n-ar fi mesaj ar strica exact tabelul din care se citește ce a primit o familie. Aceeași
judecată ca la miniaturile din [E14](E14-proiecte-elevi.md) S3b: **coada e o coloană pe rândul
care se procesează** — `fiscalStatus` plus `fiscalNextAttemptAt`, cu index —, nu o tabelă alăturată
care diverge prima dată când se șterge o factură.

**Progresul se vede pe `/admin/invoices/[luna]`**: modul SmartBill scris în cuvinte, câte facturi
sunt în fiecare stare, blocarea dacă e una, și pe fiecare rând starea, numărul fiscal, linkul în
SmartBill și propoziția lor când au refuzat. „Raportează individual ce a eșuat" e rândul însuși.

### S4 · Plata cu cardul în portal — amânată

**Nu se face acum.** Părintele primește factura și plătește prin transfer sau numerar, cum alege
el — vezi [Decizii luate](#decizii-luate). Plata cu cardul nu rezolvă nicio problemă pe care o are
școala azi: nu lipsește o metodă, lipsește evidența metodelor existente, iar aceea e S1 plus S5.

Story-ul rămâne scris, nu șters, fiindcă munca de documentare din el e reală și ar fi refăcută
degeaba peste un an. Ce se știe, și rămâne valabil în ziua în care se reia:

- procesatorul ar fi unul care suportă piața românească — Netopia, EuPlătesc sau Stripe;
- confirmarea ar veni prin webhook, tratat **idempotent**: același eveniment livrat de două ori nu
  are voie să înregistreze două plăți. E cea mai frecventă sursă de bug la integrările de plăți;
- plata s-ar înregistra în platformă **și** ca încasare pe factura din SmartBill, exact pe drumul
  construit la S5;
- datele de card nu ating platforma, toată colectarea se face în interfața procesatorului.

Nimic din ce se construiește acum nu trebuie să facă reluarea grea, și nici nu o face: modelul din
S1 are deja sumă, metodă, referință externă și stare, deci un procesator ar adăuga o valoare de
metodă și o rută de webhook, nu o schemă nouă. Nu se adaugă însă **nimic** speculativ pentru el —
niciun câmp care să nu aibă rost și pentru transfer sau numerar.

**Condiția în care se repune întrebarea**, scrisă ca să fie recunoscută la timp: când numărul de
familii face din bifatul fiecărei încasări o corvoadă zilnică vizibilă, când părinții cer plata cu
cardul de la ei. Al treilea motiv de pe listă — încasarea automată a tranșei a doua din
[E15](E15-pricing-facturare.md) S3 — **a dispărut odată cu S3**; ce ar mai putea cere card salvat e
încasarea recurentă a facturii lunare, și aia nu e cerută de nimeni.

**Acceptanță:** niciuna. Story-ul e amânat, nu în lucru. Dacă apare o acceptanță aici, înseamnă că
decizia s-a schimbat și se scrie ca decizie, cu data ei.

**Septembrie 2026 — dacă se reia, procesatorul nu se integrează în platformă deloc.** SmartBill are
deja integrarea cu Netopia, EuPlătesc și Stripe: cu procesatorul conectat în SmartBill Cloud
(Configurare > Integrări), o factură emisă cu `paymentUrl: "Generate URL"` poartă butonul „Plătește
cu cardul", iar încasarea se înregistrează **singură** în SmartBill. Deci lista de mai sus se
scurtează: fără webhook, fără date de card, fără al treilea sistem cu stările lui. Rămân două
lucruri, și al doilea e condiția:

- platforma cere linkul la emitere și îl arată familiei — o linie în `invoicePayload`, un câmp pe
  factură;
- **starea plății trebuie adusă înapoi din SmartBill înainte ca linkul să existe.** O plată cu
  cardul se înregistrează acolo, nu aici, iar fără sincronizare mementoul de restanță din S7 ar
  scrie unei familii care a plătit ieri — exact riscul din [Riscuri](#riscuri). Sincronizarea e
  jumătatea de divergență din S8 (`GET /invoice/paymentstatus`), deci ordinea e S8, apoi linkul.

Până atunci decizia nu se schimbă: transfer și numerar. Munca de reconciliere contează mai mult
decât o metodă în plus, iar portalul cere deja familiei să treacă numărul fiscal al facturii în
detaliile transferului — referința după care S8 va potrivi extrasul.

### S5 · Încasările: numerar și transfer bancar

Drumul obișnuit, nu excepția. Adminul înregistrează încasarea în platformă — factura, suma, data,
metoda, referința ordinului de plată sau a chitanței —, iar platforma o propagă în SmartBill. Un
singur loc de introducere, nu două, și cu atât mai important cu cât e singurul.

Ecranul contează la fel de mult ca integrarea. Cazul real e un admin care se uită într-un extras cu
douăzeci de rânduri și caută cui aparțin: încasarea se începe **de la factura restantă**, cu suma
precompletată, nu dintr-un formular gol în care se aleg factura și suma de la zero. O încasare care
cere patru câmpuri tastate corect de fiecare dată ajunge să nu fie introdusă, iar starea facturilor
din platformă devine ficțiune.

Propagarea în SmartBill poate eșua fără ca banii să fi eșuat. Încasarea rămâne înregistrată local,
cu starea de sincronizare vizibilă și reîncercare, fiindcă adevărul e la bancă, nu în API.

**Acceptanță:** o încasare introdusă în platformă apare în SmartBill fără intervenție. O eroare de
rețea la propagare nu pierde încasarea și nu o dublează la reîncercare. Factura plătită iese din
lista de restanțe și oprește memento-urile din S7 în aceeași clipă.

> **Livrat întâi: jumătatea de ecran.** Propagarea a venit după, mai jos.
>
> Încasarea se începe acum de la rândul de restanță: butonul „Încasează" din `/admin/restante`
> deschide formularul deja completat cu familia, factura și **restul de plată**, nu cu totalul
> facturii. Diferența nu e cosmetică: ecranul dinainte precompleta totalul, deci o familie care
> plătise 200 din 350 și aducea restul de 150 avea 350 tastat în locul ei, iar registrul ajungea cu
> 550 încasați pe o factură de 350.
>
> `/admin/payments/new` nu mai e un formular gol cu un combo peste toate facturile din istorie: e
> lista facturilor care mai au ceva de plată, cu căutare, și același formular se deschide din ea.
> **Lista aia e lista de restanțe** — cele două mulțimi sunt aceeași, fiindcă „mai are ceva de
> plată" înseamnă exact `pending` sau `overdue` cu rest pozitiv, adică ce răspunde deja
> `GET /invoices/arrears`. Așa suma precompletată nu poate să contrazică ecranul de restanțe: e
> calculată o singură dată, de serviciul care deține întrebarea.
>
> O sumă mai mare decât restul se poate tasta — o familie care plătește luna următoare în avans e
> viață normală, iar `CreatePaymentDto` a decis dinainte să nu plafoneze —, dar ecranul o spune
> înainte de salvare, ca să nu fie o greșeală de tastare care trece tăcut.
>
> Ultima parte a acceptanței — factura plătită iese din listă și oprește mementourile — se ține deja
> singură din S7: lista se derivă din plățile reușite, iar `arrears.e2e-spec.ts` o verifică pe
> ambele jumătăți, plata parțială și plata integrală. Ecranul reîncarcă lista după fiecare încasare,
> deci rândul dispare acolo unde a fost apăsat butonul.

**Propagarea e construită (septembrie 2026) — testată pe un SmartBill fals, neatinsă pe contul
real**, pe drumul facturilor din S2 și cu aceleași reguli. Fiecare plată reușită pe o factură pe care
SmartBill o numerotează ajunge singură acolo ca încasare pe factură (`POST /payment`, cu
`useInvoiceDetails` și `invoicesList`), trimisă de `PaymentFiscalService` la 30 de secunde, nu de
cererea care a înregistrat-o. Adminul tastează o dată, în platformă — „un singur loc de introducere".

- **Numerarul devine chitanță, transferul nu devine nimic.** O plată în numerar e o `Chitanta`
  numerotată pe seria platformei, `SMARTBILL_RECEIPT_SERIES` — obligatorie în `live` și tot a
  platformei, ca seria de facturi. Un transfer e un `Ordin plata`: SmartBill îl ține pe factură fără
  document, iar răspunsul nu poartă nici număr, nici serie, nici vreun identificator.
- **Proba e suma încasată pe factură.** Fără cheie de idempotență și, la transfer, fără nimic după
  care să cauți, singurul lucru pe care îl schimbă o cerere e `paidAmount` din
  `GET /invoice/paymentstatus`. Se citește înainte de cerere și se scrie pe rând
  (`fiscalExpectedPaid`), iar după un răspuns pierdut se recitește: **neschimbată → nu s-a înregistrat
  nimic și se retrimite** — acceptanța, „nu o dublează la reîncercare" —; **mișcată exact cu plata →
  un om confirmă**, la numerar cu numărul chitanței, sugerat din seria care a mișcat cu unu;
  **mișcată altfel → un om, fără sugestie**. Aceeași bară ca la facturi: platforma nu marchează
  înregistrat ce n-a văzut venind înapoi. Și de aceea pe facturile platformei nu se înregistrează
  încasări de mână în SmartBill Cloud — ar mișca proba sub o cerere care așteaptă să fie judecată.
- **Plata așteaptă factura.** Una înregistrată înainte ca SmartBill să numeroteze factura stă în
  coadă, iar ecranul spune „Așteaptă factura"; pleacă la prima trecere de după emitere. Una pe o
  factură refuzată așteaptă la fel, până o retrimite cineva.
- **Numai în `live`.** În `draft` factura e ciornă, fără număr pe care să se înregistreze o
  încasare, iar dintre încasări doar chitanța are formă de ciornă — un ordin de plată trimis de pe
  stage ar fi un rând în contabilitatea școlii. Deci în `draft` plățile nu pleacă deloc, iar chitanța
  se vede din `pnpm smartbill:check --draft --receipt`: o ciornă de sine stătătoare, de privit și
  șters.
- **O plată pe care SmartBill o ține nu se mai corectează aici, se stornează.** Suma, data și metoda
  se refuză (`PAYMENT_RECORDED_IN_SMARTBILL`), iar ștergerea la fel; starea rămâne editabilă, deci un
  transfer întors se trece `reversed`, iar încasarea din SmartBill se șterge de mână. Nu se șterge
  automat, dinadins: ruta lor găsește o încasare după factură și tip — ambiguu când pe factură sunt
  două de același fel —, iar o chitanță se poate șterge numai dacă e ultima din serie. Până se șterge,
  divergența o arată S8.
- **`updatePayment` scrie acum numai câmpurile trimise, sub lacătul rândului** — capcana din S2 cu
  `save` pe o factură citită înainte, a doua oară: rândul poartă starea cozii, iar o salvare veche ar
  fi pus înapoi `pending` peste o plată abia înregistrată, care ar fi plecat a doua oară.

### S6 · Chitanțe și confirmări

SmartBill emite documentul; platforma trimite confirmarea către părinte prin
[E17](E17-comunicare-notificari.md), cu link către PDF. Trimiterea se poate face și direct de
SmartBill, dar prin E17 rămâne evidența livrării într-un singur loc.

**Acceptanță:** părintele primește confirmarea în aceeași zi, fără intervenție.

> **Livrat: confirmarea. Documentul nu — îl blochează S0, ca și pe S5.**
>
> Story-ul are două jumătăți și doar una atârna de SmartBill. Cealaltă era o tăcere: până acum,
> înregistrarea unei încasări schimba factura, scotea familia de pe lista de restanțe și oprea
> mementourile — și **nu-i spunea nimic celui care tocmai plătise**. `PaymentModule` nici măcar nu
> importa coada. O familie care dă un transfer bancar și nu aude nimic înapoi n-are cum să
> deosebească „a ajuns" de „s-a pierdut", iar următorul lucru pe care îl primește e factura lunii
> următoare.
>
> **Chitanța se datorează în clipa în care o plată _devine_ `succeeded`, nu când se scrie un rând
> în `payments`.** Distincția e toată regula: un admin care trece un transfer ca `initiated` cât
> timp extrasul e provizoriu n-a primit încă nimic, iar „am primit plata" în acel moment e o
> promisiune despre banii altcuiva. Deci `createPayment` trimite dacă plata intră direct
> `succeeded`, iar `updatePayment` trimite dacă tocmai a devenit — o editare pe o plată deja
> reușită nu retrimite nimic, fiindcă nu a devenit adevărat nimic.
>
> **Cât a rămas de plată vine din recalculare, nu dintr-o a doua scădere.**
> `recomputeInvoiceStatus` returnează acum `{ paid, outstanding, status }`: suma plăților reușite se
> face acolo oricum, iar un `amount - plăți` scris încă o dată în compozitor ar fi a doua definiție
> a lui „rest", liberă să se depărteze de cea care tocmai a stabilit starea facturii. Aceeași regulă
> pe care o respectă S5 și S7, aplicată cu un nivel mai jos.
>
> **Două șabloane, nu unul cu `if`:** `payment-received` când factura e acoperită și
> `payment-received-partial` când mai rămâne ceva, ca `payment-due-soon` și `payment-overdue`. Al
> doilea spune cifra rămasă, ca familia să n-o afle din următorul memento.
>
> **Cheia de deduplicare e `receipt:<id-ul plății>`**, fără ziua din ea — spre deosebire de
> mementourile din S7, care se repetă prin design și pe care ziua le separă. O plată se confirmă o
> singură dată. Costul, spus pe față: dacă suma unei plăți e corectată în sus după ce chitanța a
> plecat, familia rămâne cu o cifră care nu mai e bună — aia e un telefon, nu un al doilea email.
> La fel, ștergerea unei plăți nu trimite nicio dezmințire.
>
> Mesajul se pune în coadă **în tranzacția care înregistrează banii**, cu managerul dat mai departe:
> chitanța și plata care o justifică se scriu împreună sau deloc. Și trece prin `queueOrRecord`, nu
> prin `queue`, deci o familie fără adresă lasă un rând `undeliverable` cu motiv, nu o tăcere
> (E17/S5) — iar `queueMarketing` n-are ce căuta aici: o chitanță e executarea contractului, nu
> reclamă, deci niciun comutator nu o poate opri.
>
> Ce rămâne din story e exact partea blocată: documentul fiscal emis de SmartBill și linkul către
> PDF-ul lui. Când vine S2, chitanța capătă un link; propoziția pe care o citește familia nu se
> schimbă.

**Documentul a venit cu propagarea din S5 (septembrie 2026).** O plată în numerar primește chitanța
SmartBill, iar numărul ei stă pe plată și în portal, la „Plățile înregistrate" din
`/user/payments`. Confirmarea către familie pleacă tot în clipa înregistrării — „în aceeași zi, fără
intervenție" nu atârnă de SmartBill — și duce acum la pagina aia, unde sunt factura fiscală și, pentru
numerar, chitanța, oricând ar ajunge. **Linkul e al portalului, nu al unui PDF de chitanță**, fiindcă
API-ul SmartBill nu dă PDF decât pentru facturi și proforme; al facturii e deja acolo.

### S7 · Restanțe

Un job marchează facturile depășite ca restante și trimite memento-uri după un calendar
configurabil: cu trei zile înainte de scadență, în ziua scadenței, apoi la intervale. Adminul are o
listă a restanțelor, pe locație, cu vechime.

Tonul contează: sunt părinți, nu debitori. Primul memento e o amintire, nu o somație.

**Acceptanță:** nicio factură restantă nu trece neobservată. Memento-urile se opresc imediat la
încasare.

**Livrat.** Ecranul `/admin/restante`, un job zilnic la 9:00 și două șabloane E17/S2.

**Termenul e 14 zile de la emitere, iar `Invoice` NU capătă o coloană `dueDate`.** Școala emite
factura după ce numără ședințele lunii, deci ziua emiterii e ziua în care familia află cât are de
plată, iar un termen măsurat de acolo e aceeași promisiune pentru toți. O coloană pe factură ar fi
un câmp pe care nu-l variază nimeni, liber să se depărteze de practica pe care era menit s-o
consemneze. Ziua în care termenul chiar diferă de la o familie la alta e ziua în care coloana își
merită locul.

**Lista e derivată, nu citită din `Invoice.status`.** Coloana e o memorie pe care o împrospătează
job-ul, iar o memorie e greșită exact cât timp n-a împrospătat-o nimic — un ecran despre bani n-are
voie să greșească o zi fiindcă n-a rulat un job. `markOverdue` ține coloana onestă pentru **restul**
lucrurilor care o citesc (ecranele de facturi, portalul părintelui); interogarea de aici n-o crede.
Consecința utilă: o factură acoperită de plăți dar rămasă `pending` dintr-un motiv oarecare **nu**
apare pe lista de urmărire, fiindcă o familie care a plătit n-are ce căuta acolo.

**Așa se opresc mementourile la încasare** — nu ca regulă pe care și-o amintește cineva, ci ca
absență a unui rând: plata intră, factura devine `paid`, interogarea n-o mai vede, job-ul n-are cui
scrie. Nimic nu se anulează, fiindcă nimic nu fusese programat.

**Calendarul:** cu trei zile înainte de termen o amintire prietenoasă, apoi la fiecare șapte zile
după el. Golurile sunt tot atât de mult designul cât sunt trimiterile — o familie căreia îi scrii
zilnic încetează să citească, iar atunci mesajul care conta e cel pe care învățase să-l sară.
**După 60 de zile platforma tace**: al unsprezecelea memento identic nu convinge pe nimeni, doar
învață familia că expeditorul ăsta poate fi ignorat. Rândul rămâne pe ecran, unde cineva poate ridica
telefonul — și tot de asta ecranul are numărul familiei pe rând, cu un buton de apel.

**Se cere suma rămasă, nu totalul facturii.** O familie care a plătit jumătate și e întrebată din nou
de tot citește mesajul ca „nu mi-ați înregistrat plata".

**Tonul e al unei școli, nu al unui creditor**, cum cere story-ul: primul mesaj e o amintire, al
doilea spune „se întâmplă, și de obicei e o scăpare" și oferă o discuție dacă e o perioadă grea.
Textele sunt șabloane, deci se pot rescrie fără deploy — și e bine că se pot, fiindcă tonul e exact
genul de lucru pe care patronul îl va vrea altfel decât l-am scris noi.

**Gruparea pe locație din story nu s-a făcut, și e o decizie.** O factură aparține unui părinte, iar
un părinte poate avea copii la ambele adrese — codebase-ul a decis deja că facturile ignoră
selectorul de locație exact din motivul ăsta (vezi nota de la [E08](E08-multi-locatie.md)). Gruparea
restanțelor pe locație ar trebui să aleagă arbitrar una din cele două ale unei familii, ceea ce e mai
rău decât negruparea. Vechimea e axa care chiar schimbă ce face adminul, și e cea livrată.

### S8 · Reconciliere și verificare

Import de extras bancar cu potrivire automată după sumă, dată și referință; ce nu se potrivește
ajunge într-o coadă pentru decizie umană.

Cu încasarea manuală ca singur drum, importul de extras nu mai e un lux: e diferența dintre un admin
care confirmă niște potriviri propuse și unul care copiază douăzeci de rânduri pe lună de mână. Se
poate trăi și fără el la volumul de azi, deci nu blochează nimic — dar e prima piesă de făcut din S8,
înaintea verificării de divergență, fiindcă ea atinge munca zilnică a cuiva.

Separat, o verificare periodică între platformă și SmartBill: orice factură cu stări divergente
între cele două sisteme e semnalată. Cu două surse de adevăr parțiale, divergența e inevitabilă;
important e să fie vizibilă.

**Acceptanță:** peste 80% dintre transferuri se potrivesc automat. Divergențele dintre sisteme apar
într-un raport, nu într-o surpriză la finalul lunii.

## Dependențe

[E15](E15-pricing-facturare.md). Nu se poate emite corect ce nu e calculat corect.

**[E17](E17-comunicare-notificari.md) e necesar pentru S6 și S7.** Confirmarea de plată și mementoul
de restanță sunt mesaje către părinți: fără canalul din E17 nu au pe unde pleca, iar acceptanțele lor
— „părintele primește confirmarea în aceeași zi", „mementourile se opresc imediat la încasare" — nu
se pot verifica. E17 înregistrează deja rândul pentru E16 în tabelul din Problema lui; aici se scrie
și reciproca, ca dependența să se vadă din ambele părți. Nu e în antet fiindcă nu blochează epicul:
S0-S5 se fac fără să plece niciun email.

Tot din E17 vine și mecanismul de fundal. **Coada temperată la 3 apeluri pe secundă din S3 nu e o
coadă proprie**: folosește mecanismul decis în [E17](E17-comunicare-notificari.md) S3, cu limitarea
de rată ca politică peste el. La fel jobul de restanțe din S7. Miza e că `apps/api` nu are azi niciun scheduler și niciun broker în dependențe,
deci prima implementare fixează alegerea pentru toate celelalte; două mecanisme paralele pe aceeași
instanță ar însemna două comportamente la reîncercare și două locuri de căutat când un job nu a
rulat.

## Riscuri

**Abonamentul Platinum e o premisă, nu un detaliu.** Dacă nu e disponibil, tot epicul își schimbă
forma și partea de conformitate fiscală revine în scop. De aceea S0 e primul.

**Două sisteme cu stări proprii vor diverge.** Platforma crede că factura e plătită, SmartBill nu,
sau invers. S8 nu e o rafinare, e mecanismul care face divergența vizibilă înainte să devină
problemă contabilă.

**Limita de 3 apeluri pe secundă e ușor de depășit accidental.** O sincronizare de fundal pornită
în paralel cu o emitere în masă blochează accesul zece minute. Toate apelurile trebuie să treacă
prin aceeași coadă temperată, nu doar cele din S3.

**Reconcilierea manuală se face, sau pur și simplu nu se face.** E riscul central al epicului de
când plata online a ieșit din scop. O plată care a intrat în cont și n-a fost bifată transformă
memento-ul de restanță din S7 într-o somație trimisă cuiva care a plătit acum o săptămână — un fel
de greșeală care costă mai mult decât o funcționalitate lipsă. Calendarul de memento-uri și
disciplina bifatului sunt o singură decizie, nu două: dacă al doilea nu se ține, primul se pornește
cu prudență.

**Plata cu cardul rămâne amânată, nu interzisă.** Riscurile ei — un părinte căruia i s-au luat banii
fără ca factura să se marcheze plătită, webhook-uri duplicate, date de card care n-au voie să atingă
platforma — nu dispar, doar nu se aplică acum. Sunt scrise la S4, ca să fie găsite acolo în ziua în
care se reia.

## Definition of done

Facturile se emit prin SmartBill, cu referința stocată în platformă. Fiecare încasare — numerar sau
transfer — se introduce o singură dată, în platformă, și ajunge singură în SmartBill. Starea unei
facturi în portal se derivă din plăți, nu se scrie de mână. Divergențele între sisteme sunt vizibile
înainte să devină problemă contabilă.

## Întrebări deschise

- ~~**Abonamentul actual permite acces API?**~~ **Contul există** (septembrie 2026); răspunsul
  definitiv îl dă `pnpm smartbill:check`, doar prin citiri, fără niciun document — vezi S0.
- ~~Ce date de facturare cere SmartBill pentru un document emis către o persoană fizică? E nevoie de
  CNP?~~ **Nume și adresă. Fără CNP.** Lista din [E11](E11-inscrieri-capacitate.md) S2 e deci
  suficientă și formularul de înregistrare nu se schimbă. Consecințele complete, la
  [Decizii luate](#decizii-luate).
- **Ce cere e-Factura la transmiterea în SPV rămâne neverificat.** Răspunsul de mai sus e despre
  pragul SmartBill; al doilea prag îl trece SmartBill în locul nostru și nu se vede de aici. Nu se
  colectează nimic în plus pe baza lui — dar primul document respins la transmitere redeschide
  întrebarea, și atunci se pune contabilului, nu se ghicește.
- Care e forma juridică a școlii și regimul de TVA? Se configurează în SmartBill, dar trebuie știut.
  **Jumătate de răspuns vine acum din cont**: `pnpm smartbill:check` listează cotele configurate.
  Care dintre ele e cea corectă pentru cursurile școlii — normală, scutită (`SFDD`) sau niciuna,
  pentru un neplătitor — e o întrebare pentru contabil, iar răspunsul se scrie în
  `SMARTBILL_TAX_NAME` și `SMARTBILL_TAX_PERCENTAGE`.
- ~~Ce procesator de plăți? Plățile recurente sunt de dorit pentru tranșa a doua?~~ **Nu se pun
  acum.** Plata cu cardul e amânată, iar tranșa a doua se încasează la fel ca prima: factură,
  transfer sau numerar, bifat manual. Amândouă întrebările revin odată cu S4, dacă revine.

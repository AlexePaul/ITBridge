# E16 · Încasări și facturare prin SmartBill

**Status:** propus · **Pistă:** Bani · **Depinde de:** E15 · **Blochează:** E21

## Problemă

`Payment` are patru câmpuri: `id`, `invoice`, `method` cu valoarea implicită `'cash'`, și `date`.

**Nu are sumă.** Nu are referință de tranzacție, nu are stare, nu are cine a înregistrat-o. Relația
cu `Invoice` e unu-la-unu.

Consecințele:

- **Plata parțială e imposibilă de reprezentat.** Planul în două tranșe din
  [E15](E15-pricing-facturare.md) nu are unde să existe.
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

| | Platforma | SmartBill |
|---|---|---|
| Ce se datorează, cui, pentru ce modul | ✓ | |
| Planuri de plată, tranșe, scadențe | ✓ | |
| Afișare pentru părinte, istoric, portal | ✓ | |
| Serie și număr de factură | | ✓ |
| PDF-ul fiscal | | ✓ |
| TVA și date de emitent | | ✓ |
| Transmitere în SPV pentru e-Factura | | ✓ |
| Evidența contabilă și exportul | | ✓ |

Platforma păstrează propria entitate `Invoice` — are nevoie de ea pentru portal, tranșe și
rapoarte — dar aceasta stochează **referința** către documentul SmartBill: serie, număr, id și
link la PDF. Sursa de adevăr fiscală e la ei.

Ce iese din scop față de forma inițială a epicului: gestionarea seriilor și numerelor, calculul
TVA, integrarea directă cu ANAF, și generarea PDF-ului de factură. Toate sunt rezolvate de SmartBill.

## Ce trebuie știut despre API

Verificat în [documentația lor](https://api.smartbill.ro/) și în
[ghidul de integrare](https://ajutor.smartbill.ro/article/196-integrare-api):

- **Cere abonament Facturare Platinum.** E o constrângere comercială, nu tehnică, și trebuie
  confirmată **înainte** de orice altceva din acest epic.
- **REST, JSON, HTTP Basic Auth** cu email plus token. Endpoint de forma `/SBORO/api/invoice`.
  V1 pentru facturare curentă, V3 pentru funcții mai noi.
- **Limită de 3 apeluri pe secundă.** Depășirea blochează accesul 10 minute. Determină direct
  designul emiterii în masă — vezi S3.
- Operații disponibile: emitere de facturi, ștergere și anulare, acces la PDF, proforme
  convertibile în facturi, **încasări pe o factură** (deci plata parțială e suportată nativ),
  trimitere de documente pe email, gestiunea clienților și produselor.
- **e-Factura:** cu modulul activ, SmartBill trimite XML-ul în SPV după emitere. Nu gestionăm
  nici XML, nici semnături, nici termene.
- Suportul pentru API se face **doar pe email**, la `vreauapi@smartbill.ro`. Merită luat în calcul
  la estimare: o întrebare de integrare nu se rezolvă în cinci minute.

## Decizii luate

**Plata în tranșe produce două facturi, nu o factură cu două încasări.** Alegerea părintelui la
înscriere determină câte documente fiscale se emit: unul de 700, sau două — vezi
[E15](E15-pricing-facturare.md) S3.

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
  Împărțirea sumei se face prin planul în tranșe din [E15](E15-pricing-facturare.md) S3, care
  produce două facturi, nu prin încasări fracționate pe una singură.

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

### S2 · Emiterea prin SmartBill

La confirmarea emiterii din [E15](E15-pricing-facturare.md) S6, platforma trimite documentul către
SmartBill și stochează referința primită. PDF-ul nu se mai generează local.

Tratarea eșecurilor contează mai mult decât cazul fericit: o factură care a eșuat la SmartBill nu
trebuie să rămână „emisă" în platformă, iar o reîncercare nu trebuie să producă document dublu.
Deci fiecare emitere are cheie de idempotență proprie și stare de sincronizare explicită.

**Acceptanță:** o eroare de rețea la mijlocul emiterii nu produce nici factură fantomă în
platformă, nici document dublu în SmartBill.

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
cardul de la ei, sau când apare dorința de încasare automată pentru tranșa a doua din
[E15](E15-pricing-facturare.md) S3 — singurul lucru care chiar cere card salvat, nu doar comoditate.

**Acceptanță:** niciuna. Story-ul e amânat, nu în lucru. Dacă apare o acceptanță aici, înseamnă că
decizia s-a schimbat și se scrie ca decizie, cu data ei.

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

### S6 · Chitanțe și confirmări

SmartBill emite documentul; platforma trimite confirmarea către părinte prin
[E17](E17-comunicare-notificari.md), cu link către PDF. Trimiterea se poate face și direct de
SmartBill, dar prin E17 rămâne evidența livrării într-un singur loc.

**Acceptanță:** părintele primește confirmarea în aceeași zi, fără intervenție.

### S7 · Restanțe

Un job marchează facturile depășite ca restante și trimite memento-uri după un calendar
configurabil: cu trei zile înainte de scadență, în ziua scadenței, apoi la intervale. Adminul are o
listă a restanțelor, pe locație, cu vechime.

Tonul contează: sunt părinți, nu debitori. Primul memento e o amintire, nu o somație.

**Acceptanță:** nicio factură restantă nu trece neobservată. Memento-urile se opresc imediat la
încasare.

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
de rată ca politică peste el. La fel jobul care emite tranșa a doua la mijlocul modulului și cel de
restanțe din S7. Miza e că `apps/api` nu are azi niciun scheduler și niciun broker în dependențe,
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

- **Abonamentul actual permite acces API?** Prima verificare, blochează tot restul.
- ~~Ce date de facturare cere SmartBill pentru un document emis către o persoană fizică? E nevoie de
  CNP?~~ **Nume și adresă. Fără CNP.** Lista din [E11](E11-inscrieri-capacitate.md) S2 e deci
  suficientă și formularul de înregistrare nu se schimbă. Consecințele complete, la
  [Decizii luate](#decizii-luate).
- **Ce cere e-Factura la transmiterea în SPV rămâne neverificat.** Răspunsul de mai sus e despre
  pragul SmartBill; al doilea prag îl trece SmartBill în locul nostru și nu se vede de aici. Nu se
  colectează nimic în plus pe baza lui — dar primul document respins la transmitere redeschide
  întrebarea, și atunci se pune contabilului, nu se ghicește.
- Care e forma juridică a școlii și regimul de TVA? Se configurează în SmartBill, dar trebuie știut.
- ~~Ce procesator de plăți? Plățile recurente sunt de dorit pentru tranșa a doua?~~ **Nu se pun
  acum.** Plata cu cardul e amânată, iar tranșa a doua se încasează la fel ca prima: factură,
  transfer sau numerar, bifat manual. Amândouă întrebările revin odată cu S4, dacă revine.

# E22 · Termeni, confidențialitate și ciclul de viață al datelor

**Status:** propus · **Pistă:** Fundație · **Depinde de:** toate · **Blochează:** —

## De ce e ultimul

Nu din lipsă de importanță, ci fiindcă **termenii descriu ce face platforma**, iar o descriere
scrisă peste un sistem care încă își schimbă forma e o descriere care va fi falsă înainte s-o
citească cineva. Fiecare epic de până aici a schimbat ce se stochează despre o familie: E11 a adus
înscrierile și cele două porți de cont, E12 anunțurile de absență și recuperările, E14 fișierele
copiilor, E16 plățile cu sumă și referință. Un document scris la jumătatea drumului ar fi trebuit
rescris de patru ori, iar versiunea acceptată de familii ar fi rămas în urmă la fiecare pas.

Deci se scrie la final, cu platforma în față — și abia atunci poate spune adevărul despre ea.

## Problemă

Trei lucruri diferite se cheamă toate „legal" și se amestecă ușor. Epicul ăsta le ține separate:

- **Ce vede vizitatorul site-ului** — politica de cookie-uri, bannerul de consimțământ, nota de
  confidențialitate publică. **Mecanica lor rămâne la [E07](E07-securitate-gdpr.md) S5**, care e o
  problemă tehnică: bannerul chiar trebuie să blocheze scripturile până la accept.
- **Contractul dintre școală și familie** — se semnează pe hârtie, iar platforma reține doar că
  există. Rămâne la [E07](E07-securitate-gdpr.md) S8 și nu se mută.
- **Termenii care guvernează contul și datele din el** — ce ține platforma despre o familie și
  despre copiii ei, de ce, cât timp, și ce se întâmplă când familia pleacă. **Ăsta e golul**, și e
  al epicului de față.

Golul are un cost concret azi, nu unul teoretic. [E04](E04-migrari-date.md) S5 a decis că retragerea
unei familii e o **ștergere logică** aplicată de un admin. Aia e o stare reversibilă și un ecran
curat — ce nu e, e un răspuns la „și când dispar efectiv datele". Fără un termen scris undeva unde
familia l-a văzut, răspunsul e „niciodată, în practică", iar asta e exact ce principiul limitării
stocării nu permite.

## Story-uri

### S1 · Inventarul a ce se stochează, la zi

Ce câmpuri există despre o familie și despre un copil, în ce tabel, de ce, și cine le poate citi.
Nu un document scris de mână: derivat din entități, ca să nu poată rămâne în urmă tăcut — aceeași
disciplină ca `contract.ts`, care există fiindcă două seturi de tipuri divergeau fără să spună.

Se suprapune cu [E07](E07-securitate-gdpr.md) S1, și intenționat: acolo e inventarul ca exercițiu de
securitate, aici e sursa din care se scriu termenii. Dacă S1 din E07 e făcut înainte, ăsta îl
citește în loc să-l refacă.

**Acceptanță:** o coloană nouă pe o entitate cu date personale nu poate ajunge în producție fără să
apară în inventar.

### S2 · Termenii contului și nota de confidențialitate

Documentul pe care îl acceptă un părinte când își face cont: ce ține școala, de ce, cât timp, cu
cine împarte (SmartBill pentru facturi, Resend pentru email, AWS pentru fișiere), și ce drepturi
are familia. Scris în română, pentru un părinte, nu pentru un jurist — dar verificat de unul.

**Cele trei subîmpărțiri pe care documentul trebuie să le facă explicit**, fiindcă platforma le face
deja și ar fi absurd să nu le spună:

- **executarea contractului** — factura, chitanța, ora anulată, proiectul copilului. Nu stau pe nicio
  bifă, iar [E17](E17-comunicare-notificari.md) S4 a construit garanția în cod: coada tranzacțională
  nu primește deloc preferința de marketing;
- **consimțământ** — marketingul, și numai el. Implicit oprit, fiindcă un consimțământ pe care nu l-a
  dat nimeni nu e consimțământ;
- **obligație legală** — ce ține SmartBill, nu noi.

**Acceptanță:** un părinte poate citi documentul și poate spune, corect, ce se întâmplă cu datele
copilului lui după ce se retrage.

### S3 · Termenul de păstrare, și ștergerea care chiar șterge

Un număr, scris în S2 și implementat: după cât timp de la retragere dispar efectiv datele unei
familii. Ștergerea logică din [E04](E04-migrari-date.md) S5 devine prima jumătate a unui drum cu
două capete, în loc de o stare terminală care se numește ștergere fără să fie.

**Ce complică lucrurile și trebuie decis, nu ocolit:** un copil retras apare în catalogele altor
copii? Nu — prezența e legată de ședință și de copil, iar ședința rămâne. Dar suma unei facturi
vechi a unei familii plecate e ea însăși o dată despre acea familie, iar ea stă și în SmartBill. Deci
termenul de aici e despre ce ține **platforma**, iar ce ține SmartBill are termenul lui, al
contabilității.

**Acceptanță:** termenul e scris în document, implementat ca job, și verificabil — se poate arăta
că o familie retrasă acum N luni nu mai are date personale în platformă.

### S4 · Evidența acceptărilor

Cine a acceptat ce versiune și când. Versionat, fiindcă un document care se schimbă fără istoric
face imposibil de spus ce a acceptat de fapt o familie — iar aia e singura întrebare care contează
dacă vreodată e întrebat cineva.

Se leagă de [E07](E07-securitate-gdpr.md) S5, care cere același lucru pentru documentele de
vizitator. Un singur mecanism pentru amândouă.

**Acceptanță:** pentru orice familie și orice document, se poate spune ce versiune a acceptat și în
ce zi.

## Dependențe

**Toate.** Nu ca formalitate: S1 nu poate fi corect înainte ca entitățile să se așeze, S2 nu poate
descrie fluxuri care încă se schimbă, iar S3 nu poate pune un termen pe date a căror formă nu e
finală.

## Riscuri

**Scris prea devreme, e o minciună întreținută.** Un document care descrie o platformă de acum trei
luni e mai rău decât niciunul: familia a acceptat ceva care nu mai e adevărat, iar școala crede că
s-a acoperit.

**Scris de un dezvoltator și neverificat, e o părere.** Textul se scrie aici fiindcă aici se știe ce
face sistemul; validitatea lui juridică e treaba altcuiva, iar epicul nu e terminat până n-a trecut
pe la el.

**Amânat la infinit fiindcă „nu blochează nimic".** Nu blochează, e adevărat — și de asta e riscul
real ca platforma să fie „gata" luni la rând fără el. Condiția de ieșire e simplă și merită scrisă:
**nu se deschide accesul familiilor la platformă fără S2.**

## Decizii luate

**Epicul ăsta e ultimul, prin decizie explicită a patronului**, iar motivul e cel din capul
fișierului: termenii descriu platforma, deci se scriu după ce platforma nu-și mai schimbă forma.

**Ștergerea logică a fost aleasă înaintea unui job de retenție automat** — vezi
[E04](E04-migrari-date.md) S5. Retragerea e un fapt pe care școala îl știe; un job care ar deduce
„inactiv de N luni" ar șterge exact familia care a luat o pauză de o vacanță.

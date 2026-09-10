# E22 · Termeni, confidențialitate și ciclul de viață al datelor

**Status:** în lucru · **Pistă:** Fundație · **Depinde de:** toate · **Blochează:** —

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

- **Ce vede vizitatorul site-ului** — politica de cookie-uri și nota de confidențialitate publică.
  **Textele lor intră în S2**, cu restul; la [E07](E07-securitate-gdpr.md) S5 rămâne bannerul însuși,
  care e o problemă tehnică: trebuie să blocheze scripturile până la accept.
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

> Granița cu [E07](E07-securitate-gdpr.md) e în tabelul din capul acelui fișier: acolo mecanica, aici
> ce citește și acceptă familia. Dacă rezultatul unui story e un rând, un endpoint sau un script, nu
> e al epicului ăstuia.

### ~~S1 · Inventarul a ce se stochează, la zi~~ — mutat la [E07](E07-securitate-gdpr.md) S1

Era același tabel scris de două ori, cu justificarea că „acolo e inventarul ca exercițiu de
securitate, aici e sursa din care se scriu termenii". Justificarea nu ține: două inventare
întreținute separat diverg, iar cel care ajunge sub ochii unei familii ar fi tocmai cel rămas în
urmă.

Inventarul e unul singur și stă în E07 S1, derivat din entități. **S2 de mai jos îl citește.** Ce
rămâne al epicului ăstuia din vechiul story e cerința pe care i-o pune: dacă din inventar nu se
poate scrie direct o notă de confidențialitate, inventarul nu e gata.

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

**Stare: ciornă 0.1 scrisă, în [`docs/legal/`](../legal/README.md)** — termenii, nota de
confidențialitate și politica de cookie-uri, trei fișiere și un README care spune de unde vine
fiecare fapt. Scrise direct din entități, fiindcă inventarul din [E07](E07-securitate-gdpr.md) S1 nu
există încă; când va exista, documentele se reconciliază cu el, nu invers. **Verificate clauză cu
clauză contra legii** — GDPR art. 12–14, 6–9, 28, 30, 44; Legile 506/2004, 365/2002, 193/2000,
82/1991; Cod civil art. 1203 — cu tabelul cerință → secțiune → stare în README, și cu ce nu acoperă
o astfel de verificare scris sub el. Neverificate de avocat și nepublicate: faptele pe care codul nu le știe — firma, persoana de contact, furnizorii — și
deciziile propuse — termenul de păstrare, 12 luni de la retragere, care e cifra pe care o preia S3 —
sunt marcate `[[…]]` și listate în README, împreună cu ce trebuie să existe înainte de publicare —
din care **bannerul din E07 S5, a doua jumătate a lui S4 și restrângerea ștergerii de profil sunt
livrate**, iar jobul din S3 rămâne. Pe `release/stage` textele sunt pagini — `/termeni`,
`/confidentialitate`, `/cookies` — randate din aceleași fișiere, cu bifa de acceptare la înregistrare.

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

Acoperă și documentele de vizitator, nu doar termenii contului: sunt aceleași texte, versionate în
același loc. [E07](E07-securitate-gdpr.md) S5 nu ține niciun istoric — el doar întreabă dacă
vizitatorul a acceptat, ca să știe dacă poate porni scripturile.

**Acceptanță:** pentru orice familie și orice document, se poate spune ce versiune a acceptat și în
ce zi.

**Stare: livrat.** Înregistrarea cere `acceptedTerms: true` — un `400` fără el — și scrie, în
aceeași tranzacție cu contul, un rând în `document_acceptances` pentru fiecare document, cu
versiunea din `LEGAL_DOCUMENT_VERSIONS`; un spec ține constanta egală cu versiunea tipărită în
capul fișierului din `docs/legal/`. Documentele de vizitator nu au acceptare — bannerul din E07 S5
întreabă doar de cookie-uri.

**A doua jumătate a adus două lucruri.** Întâi, **a doua bifă**: clauzele pe care Codul civil
(art. 1203) le numește neuzuale — §14 suspendarea, §15 limitarea răspunderii, §18 modificarea
unilaterală — nu produc efecte decât acceptate **expres și separat**, deci o bifă care acoperă tot
documentul e exact acceptarea care nu contează pentru ele. Formularul întreabă a doua oară,
`acceptedUnusualClauses` e refuzat ca orice altceva decât `true`, iar evidența capătă un al treilea
rând, `unusual_clauses`, care poartă versiunea termenilor fiindcă asta e — o parte din ei. Ca să
poată fi și citite, nu doar bifate, titlurile din `docs/legal/` primesc acum id-uri, iar cele trei
secțiuni se leagă din formular.

Apoi, **re-acceptarea la versiune nouă**, pe care §18 o promite în text. `outstandingDocuments`
(`apps/api/src/modules/auth/legal-acceptance.rules.ts`) compară ce e în evidență cu ce e în vigoare
— apartenență la mulțime, nu „ultimul rând e vechi", deci un text pus la loc la o versiune deja
acceptată nu se cere a doua oară — iar răspunsul pleacă pe sârmă în `GET /auth/me`, ca
`profileComplete`: derivat pe server, fiindcă altfel ecranul care redirecționează și evidența care
consemnează ar avea două păreri despre aceeași familie. `POST /auth/accept-documents` scrie **numai
ce lipsește**, deci a doua apăsare nu mută ziua primei acceptări, și **refuză o listă care lasă ceva
neacceptat** (`LEGAL_ACCEPTANCE_INCOMPLETE`) — cazul care contează fiind exact cel din art. 1203.
În portal, `03.legal-acceptance.global.ts` duce familia la `/user/termeni-noi`, o singură bifă per
document, cu ieșirea pe care §18 o promite scrisă lângă buton. Adminii sunt exceptați: o versiune
nouă n-are voie să încuie afară singurii oameni care ar putea repara ceva.

Ce a rămas dinadins nefăcut: **nimic din API nu refuză o cerere** fiindcă familia n-a acceptat încă.
§18 promite că portalul cere, nu că platforma se închide, iar un refuz pe fiecare rută ar fi o
decizie de produs pe care n-a luat-o nimeni. Și e-mailul de confirmare din §4.7 nu se trimite încă —
E17 are coada, dar șablonul e o propoziție de scris, nu o piesă de infrastructură.

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

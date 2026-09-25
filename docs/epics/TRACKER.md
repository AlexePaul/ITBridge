# Tracker

Starea fiecărui story, la zi. Sursa e antetul și notele de livrare din fiecare epic; aici sunt doar
adunate într-un loc.

**Ultima actualizare:** 25 septembrie 2026, pe `release/stage`. **E07 S2, acordul pentru lucrările
copiilor**, ultimul story neînceput din E07 care era cod: un părinte cu doi copii poate da voie
pentru unul și nu pentru celălalt, din „Profil", iar biroul poate consemna un acord semnat pe
hârtie; `/admin/acorduri` e lista copiilor ale căror lucrări se pot folosi azi, cu linia gata de pus
lângă lucrare. Retragerea anunță biroul în aceeași tranzacție, fiindcă site-ul nu citește din
platformă și ce e publicat se scoate de mână. Înainte, **termenii §4.7 au devenit adevărați
întregi**: familia își recitește din Profil ce versiune a acceptat din fiecare document și în ce zi,
iar fiecare acceptare — la înregistrare și la fiecare versiune nouă — îi aduce un email care
confirmă exact ce a acceptat atunci. Înainte, **E07 S6, secretele**: `pnpm
secrets` caută chei și tokenuri în tot ce urmărește git, și rulează în CI; unde stă fiecare secret și
cum se rotește e scris în `docs/secrete.md`; o cheie AWS statică pe stage s-ar vedea în logul de
pornire. Înainte, **termenul de păstrare a devenit cod** — E04 S5 și E22 S3, perechea pe care nota de confidențialitate o promitea fără nimic în spate:
retragerea unei familii e o zi pe care o consemnează biroul din pagina familiei, iar la 12 luni după
ea un job de noapte o șterge prin aceeași ștergere pe care o poate cere familia, mai puțin dacă mai
datorează bani. Tot atunci pleacă cererile de probă fără înscriere, copiile mesajelor de peste un an
și linkurile expirate. Numărul rămâne propunere până îl confirmă școala, într-o singură constantă. Cu
câteva ore înainte, **E15 S6**: emiterea lunii nu mai desenează câte un PDF per familie cu tranzacția
deschisă — 100 de familii în 0,38 s, față de 8,2 s —, iar PDF-ul se desenează la prima descărcare, cu
data emiterii și reducerile în cuvinte. În aceeași zi, **SmartBill s-a deblocat — contul
există —, iar E16 e construit întreg, cât se poate fără contul real.** Faptul care a dat forma
lucrului e al lor: **SmartBill nu are sandbox**, deci orice factură de test ar fi fost una reală. S0
se ține fără niciun document fiscal: `pnpm smartbill:check` doar citește cotele TVA și seriile, iar
cu `--draft` trimite o singură ciornă, fără număr, de privit și șters. S2 și S3 sunt construite și
testate pe un SmartBill fals care vorbește HTTP: facturile pleacă dintr-o coadă, câte una, sub
limita de 30 de apeluri la 10 secunde, iar un răspuns pierdut nu devine niciodată o a doua factură —
seria decide dacă s-a emis ceva, iar un om confirmă numărul când s-a mișcat. **S5 și S6** duc la
fel fiecare încasare în SmartBill — numerarul cu chitanța lui, transferul fără document —, cu suma
încasată pe factură drept probă a unui răspuns pierdut. **S8** închide bucla din două capete, pe
`/admin/reconciliere`: extrasul băncii, citit după capul de tabel, propune factura fiecărei intrări
— sigur după numărul fiscal, cu grijă după nume și sumă —, iar fiecare confirmare e o plată ca
oricare alta; și o dată pe zi platforma citește ce știe SmartBill despre fiecare factură și spune
unde nu se potrivesc. Implicitul e `SMARTBILL_MODE=off`, care nu trimite nimic; `live` pornește
doar cu `NODE_ENV=production` și lângă baza pe care o numește, deci stage trimite cel mult ciorne.
Cu el, **jumătate din E15 S7**: în `live`, PDF-ul e al SmartBill. Plata cu cardul rămâne amânată, cu
un răspuns nou la „Netopia sau EuPlătesc?": niciunul în platformă — SmartBill le are deja integrate.
Cu zece zile înainte, **s-a închis E14 S3b, și cu el
E14**: spike-ul `.sb3` are răspuns — da, scena unui proiect Scratch se desenează din arhiva lui, cu
`sharp`-ul care era deja acolo —, iar cadrul din video iese prin ffmpeg, amândouă dintr-un ceas
propriu a cărui coadă e două coloane pe `projects`, nu o tabelă nouă. Lipsa uneltei pe host nu
consumă încercarea niciunui proiect, deci restanța se golește singură la primul tick de după
`apt install ffmpeg` — lecția pe care coada de mail a plătit-o scump în august. Mai devreme,
**s-a închis E17 S4**, dezabonarea:
fiecare mesaj promoțional poartă acum calea lui de oprire, cum cere Legea 506/2004 art. 12 și cum
promiteau deja termenii §13 — un jeton per familie, o pagină care întreabă înainte să scrie, și un
footer adăugat la singura ușă prin care trece marketingul, ca niciun expeditor să nu-l poată uita.
**S-a închis și E22 S4**, evidența
acceptărilor: clauzele pe care Codul civil art. 1203 le numește neuzuale — suspendarea, limitarea
răspunderii, modificarea unilaterală — se acceptă acum printr-o bifă separată, cu rând propriu în
evidență și cu linkuri către secțiunile pe care le acceptă, iar o versiune nouă a oricărui document
se cere la prima autentificare de după, cum promite §18. Cu o zi înainte, **s-a închis E07 S4**, exportul și
ștergerea la cerere: o familie își descarcă din portal tot ce ține școala despre ea și despre copiii
ei, și tot de acolo poate cere ștergerea contului — pe care biroul o duce la capăt dintr-un ecran
propriu, în cel mult 30 de zile, păstrând doar facturile. Nu e ștergerea logică din E04 S5: aceea e
o stare reversibilă pusă de admin, asta taie prin ea. **Și E07 S1**, inventarul de
date: toate cele 231 de coloane clasificate, 99 dintre ele date personale, cu temeiul, termenul și
cititorul scrise la fiecare — iar propoziția din acceptanță („o coloană nouă nu poate ajunge în
producție fără să apară în el") e ținută de un test care citește metadatele lui TypeORM, nu o listă.
Documentul din care E22 S2 va scrie nota de confidențialitate e randat din același fișier și
verificat că nu rămâne în urmă. Tot azi, **s-a închis
E07 S3**, audit log-ul: facturi, plăți și reduceri lasă fiecare o urmă cu cine, ce a fost și ce a
devenit, scrisă în tranzacția schimbării pe care o descrie și fără nicio cale de a o edita sau
șterge; „cine a schimbat suma facturii 412 și când" e o cerere. Cealaltă jumătate, datele personale,
consemnează numele câmpurilor atinse și nu valorile lor: câmpurile unei familii pleacă odată cu ea,
jurnalul îi supraviețuiește, iar o valoare copiată acolo ar rămâne de partea la care ștergerea din
S4 nu ajunge. Tot azi, **s-a închis E18 S5b** — bara de filtre și grila de carduri, ultima fiind un singur card desenat de opt ori; aceeași trecere a scos numele de control repetate și englezești, textul de eroare al lui ofetch arătat utilizatorului și culorile fără temă întunecată. **A intrat lista de lansare**,
[`docs/lansare.md`](../lansare.md): cele douăzeci de întrebări obișnuite de dinaintea lansării unui
site, fiecare cu starea verificată contra codului și cu dovada lângă ea. Cincisprezece din douăzeci
sunt livrate cu gardă; ce lipsește e textele juridice pe prod (E22 S2), verificarea legăturilor (E19 S9, story
nou), HSTS de verificat (E01 S5) și analiza de trafic (E19 S8), în ordinea asta. Primul punct de pe
acea listă, **bannerul de cookie-uri, s-a închis în aceeași zi**: E07 S5 a găsit un singur terț pe
site — harta Google, care se încărca singură la derulare — și l-a pus în spatele unui buton, cu o
verificare în CI care pică dacă vreo pagină publică mai iese din origine. Tot atunci **s-a închis și
E19 S9**, verificarea legăturilor: 240 de linkuri interne, citite din paginile randate, cu
fragmentele verificate pe id-uri. Cu o zi înainte,
**s-a închis E07 S8**, evidența
contractului de înscriere — jumătatea care lipsea din E11: lista înscrierilor active fără contract
consemnat, `/admin/contracte`, ușa de consemnat după și insigna „Fără contract" pe fișa copilului și
pe grupă; E07 trece din `propus` în `în lucru`. În aceeași zi, **E12 S3/S4 și-au primit ecranul de
birou**, `/admin/absente`: biroul notează absența din telefon, vede lista de luni a copiilor de
mutat, împăturită pe săptămâni, alege ora dintr-o listă a API-ului și ia o mutare înapoi; cifra celor
de mutat stă în meniu. Tot atunci, `POST /attendance/absences` a încetat să întoarcă contul
părintelui pe rândul salvat. Cu puțin înainte, două story-uri în aceeași zi.
**S-a livrat E21 S7**, semnalele timpurii: copii cu trei absențe la rând, grupe cu prezența în
scădere, familii cu două facturi restante, grupe sub prag — fila „Semnale" din rapoarte, cu
verificarea retroactivă prin „la data de", plus un mesaj către birou luni dimineața, doar când e
ceva de semnalat. **Și E12 S9**, recuperarea unei ore care nu se poate ține: un singur act, pornit
din oricare dintre cele trei stări — programată, anulată de calendar, negenerată —, cu lista
ferestrelor libere pe grila școlii și cu regula de săptămână verificată; familiile primesc un singur
mesaj. Cu o zi înainte, două lucruri deodată. **S-au adăugat** E12 S8 și E15 S9, facturarea numărată din catalog — plus, la cererea
școlii, corectura pe copil de pe fișa de emitere, consemnată și înghețată cu factura. **S-a tăiat
scopul:** E06 și E13 ies din MVP, la fel E14 S6, E21 S3 și E21 S6; E15 S1, S2 și S3 se scot, fiind
scrise pe modelul pe modul, ca S8; E21 S5 se dovedește livrat de E20 S4; E22 S1 se mută la E07 S1.
Ultimele merge-uri de cod: E21 S7, E12 S9, a treia felie din E18 S5b (`AdminDateField`), E18 S4 și a doua
felie din S5b, peste E18 S7 și E20 S1–S4, care veneau peste E17 S8, jumătatea din CI a lui E18 S6,
E17 S7, E21 S1, E16 S5, E12 S7, E21 S2/S4 și E12 S5.

## Legendă

- `[x]` livrat
- `[~]` livrat parțial — scrie ce lipsește
- `[r]` scris și verificat, dar într-un PR nemergeat
- `[!]` blocat de altcineva sau de altceva — scrie de cine
- `[ ]` neînceput
- ~~tăiat~~ scos din scop prin decizie

Din **150 de story-uri** în 22 de epicuri: 92 livrate, 24 parțiale, 2 blocate, 12 scoase din
scop, 20 neîncepute — a se citi cu legenda de mai sus, fiindcă „parțial" înseamnă adesea „construit,
dar n-a fost văzut pe date reale".

**Cifrele s-au recitit din rânduri, și cinci din șase erau greșite** — 75/19/6/36 pentru
81/21/4/32. Nota dinainte spunea că sunt numărate din rândurile de mai jos; erau, o dată, iar de
atunci au fost ținute de mână peste fiecare livrare, adică exact ce spunea că nu mai sunt. Se
renumără așa, și merită scris fiindcă are o capcană: rândurile de story sunt cele care încep în
coloana întâi cu `- [x]`, `- [~]`, `- [!]`, `- [ ]` sau `- ~~`, **numărate doar după primul titlu
`### E`** — altfel intră în total și rândul din legendă care arată cum se scrie un story tăiat, iar
numărul iese cu unul peste, ceea ce e greu de observat tocmai fiindcă e aproape.

Cele 20 neîncepute se citesc și ele cu grijă: **19 dintre ele stau în epicuri scoase din MVP** — E06,
E09, E10 și E13 — deci nu sunt lucru amânat de pe o săptămână pe alta, ci lucru scos din val. Al
douăzecilea e E07 S7, acordurile de prelucrare cu furnizorii: hârtie de acceptat în conturile lor,
nu cod. Ce a mai rămas de făcut pentru MVP e în [Ce urmează](#ce-urmează).

---

## Fundație

### E01 · Infrastructură și medii de rulare — `în lucru`

- [x] S1 · Revocarea cheii scurse
- [x] S2 · Ștergerea infrastructurii moarte
- [x] S3 · Docker doar pentru infrastructură
- [~] S4 · Producție pe VPS cu PM2 — **livrat pentru stage.** `api-stage.itbridgeschool.com` rulează pe EC2 (Postgres 17 lângă el, PM2, Caddy), iar un push pe `release/stage` deployează singur prin OIDC plus SSM, fără chei AWS în GitHub și fără port deschis. Rămâne producția, care nu e o problemă de infrastructură: `release/prod` poartă API-ul de dinainte de E08
- [x] S5 · Vercel documentat și `API_BASE` corect
- [x] S6 · Curățare de branch-uri

### E02 · Monorepo: pnpm, Turborepo — `livrat`

- [x] S1 · pnpm workspaces
- [x] S2 · Decizia de node_linker
- [x] S3 · Scripturi de dezvoltare
- [x] S4 · Pachet partajat de tipuri
- [x] S5 · Turborepo
- [x] S6 · Husky o singură dată

### E03 · Testare și CI — `livrat`

- [x] S1 · Fix-ul de rezolvare a modulelor
- [x] S2 · Curățarea scheletelor
- [x] S3 · Teste unitare pe logica de business
- [x] S4 · Teste de integrare pe API
- [x] S5 · Frontend: typecheck și vitest
- [x] S6 · Workflow CI

> O rezervă: branch protection pe `release/prod` se activează din Settings, nu din repo.

### E04 · Migrări și integritatea datelor — `în lucru`

- [x] S1 · Migrarea de bază
- [x] S2 · Migrările în deploy — comenzile, `migrationsRun: false` ca ele să fie rulate explicit, garda de drift din CI, și **cablarea, care s-a făcut la E01 S4**: `deploy.sh` rulează `migration:run` între `build` și `pm2 reload`, deci o migrare care pică oprește deploy-ul. Linia de aici spunea încă „nu există deploy", deși tabelul din capul epicului îl marca livrat de atunci — al doilea loc care răspundea, și cel care rămăsese în urmă
- [x] S3 · Seed pentru dezvoltare **și pentru staging** — **ancorat la ziua de azi**, nu la o constantă din martie: grupele acoperă luni–sâmbătă, deci „azi" are oră în șase zile din șapte. Lead-uri pe toate cele șase stări, outbox pe toate cele patru, anunțuri, absențe anunțate, credite de recuperare și șabloane — șase tabele care se deschideau goale. `pnpm seed:stage` populează staging-ul din `.env.stage`, dar numai dacă `SEED_ALLOW_NON_LOCAL` **numește baza** (nu `1`, care ar autoriza orice ar scrie `DB_NAME` luna viitoare) și `SEED_PASSWORD` e setată — `parola123` e în repo, iar staging-ul e la îndemâna oricui știe hostname-ul
- [~] S4 · Backup și restaurare — `pg_dump` zilnic la 03:15 din cron pe instanță, în S3, cu ținte separate per mediu și retenție pe o regulă de lifecycle; un dump gol nu se urcă. **Proba de restaurare, cu durata măsurată, rămâne condiția de închidere** — și de acum se poate face
- [x] S5 · Retenție — **retragerea e o zi pe familie** (`Profile.withdrawnAt`), consemnată de admin din pagina familiei și anulabilă până la termen; refuzată cât timp un copil e înscris sau pe o listă de așteptare, anulată singură de o înscriere nouă. Termenul și ștergerea sunt ale E22 S3; facturile n-au nevoie de politică, stau în SmartBill

### E05 · Robustețe backend — `livrat`

- [x] S1 · ValidationPipe global
- [x] S2 · Formă unică de eroare
- [x] S3 · Configurație validată la pornire
- [x] S4 · Logging structurat
- [x] S5 · Health și readiness
- [x] S6 · Rate limiting
- [x] S7 · Sesiuni revocabile și logout
- [x] S8 · Audit de autorizare
- [x] S9 · CORS din configurație

### E06 · Observabilitate și operare — `scos din MVP`

- [ ] S1 · Raportare de erori
- [ ] S2 · Loguri agregate
- [ ] S3 · Uptime și alertare
- [ ] S4 · Metrici
- [ ] S5 · Runbook
- [ ] S6 · Bugete de performanță

> Scos din MVP prin decizie: observabilitatea de zi cu zi e **PM2** — `pm2 logs` și `pm2 monit` pe
> instanța din E01 S4, citite de omul care a făcut deploy-ul. Singura bucată care se strică singură e
> discul umplut de loguri, iar rotația se pune pe instanță, ca modul PM2, sub utilizatorul `deploy`.
> Consecința de ținut minte: alertarea din E14 S2 rămâne fără canal, iar o excepție în producție se
> află de la părintele care sună.

### E07 · Securitate, GDPR și consimțământ — `în lucru; S1, S2, S3, S4, S5 și S8 livrate, S6 construit, S7 propus`

- [x] S1 · Inventar și clasificare — **singurul inventar**; E22 S2 îl citește, nu îl reface. Toate cele **231 de coloane** din cele 30 de tabele sunt clasificate, nu doar cele personale: fiecare e ori dată personală cu cele cinci răspunsuri, ori nu e, cu un motiv numit — **99 sunt date personale**, în 22 de tabele. Sursa e `apps/api/src/privacy/data-inventory.ts`, documentul [`docs/inventar-date.md`](../inventar-date.md) e randat din ea, iar `data-inventory.spec.ts` citește metadatele lui TypeORM și pică pe o coloană neclasificată, pe un rând învechit, pe un scop gol, pe document rămas în urmă și pe un `linkedVia` care nu duce la `Profile` — drumul pe care îl va parcurge S4. Termenele rămân ale E22 S3, dar acum sunt cinci reguli de numerotat, nu 231 de câmpuri
- [x] S2 · Consimțământ parental — **pe copil, nu pe familie**: un părinte acceptă pentru cel mare și refuză pentru cel mic, iar `/admin/acorduri` arată exact asta. Un rând per acord, de la dat la retras, cu versiunea textului din [`docs/legal/acord-lucrari.md`](../legal/acord-lucrari.md) și ziua; un index parțial ține unul singur în vigoare. Se dă și se retrage din „Profil”, câte o bifă pe copil, sau îl consemnează biroul din pagina familiei după formularul semnat — rândul spune care, jurnalul spune cine, familia primește confirmarea pe email de fiecare dată. **Un singur scop**, materialele de promovare ale școlii: vitrina din E14 S6 a ieșit din MVP, iar mesajele comerciale rămân pe `marketingOptIn`. Retragerea nu poate scoate singură ce e publicat — site-ul nu citește din platformă —, deci **anunță biroul în aceeași tranzacție**, cu ce trebuie scos. Exportul poartă acordurile, ștergerea copilului le ia. Textul e ciornă, cu restul din `docs/legal/`
- [x] S3 · Audit log — **ambele jumătăți**. Banii: `audit_log` plus `apps/api/src/modules/audit/`, legat în facturi, plăți și reduceri, cu rândul scris în tranzacția schimbării pe care o descrie și fără nicio cale de a-l edita sau șterge; acceptanța rulează capăt-la-capăt, `GET /audit?entityType=Invoice&entityId=412` spune cine a schimbat suma și când. Datele personale: crearea, editarea și ștergerea unui `Profile` sau a unui `Child` lasă **numele câmpurilor care s-au mișcat, niciodată valorile lor** — nu din prudență, ci fiindcă inventarul din S1 le dă retenția `account`, care pleacă odată cu familia, în timp ce jurnalul are retenția `audit` și îi supraviețuiește prin construcție, neavând relație către profil. Deci „cine a schimbat adresa copilului 87, și când" are răspuns, iar „care era adresa dinainte" n-are, și asta e alegerea
- [x] S4 · Export și ștergere — **ambele fluxuri**. Exportul: `GET /privacy/export` întoarce tot ce ține școala despre familia care cere, cu buton pe `/user/profile`; fără `:id` pe ruta părintelui (profilul vine din token), fără niciun hash întors, fără nimic despre altă familie. Ștergerea: familia cere din portal, biroul o duce la capăt din `/admin/stergeri`, în cel mult 30 de zile; dispar copiii cu tot ce atârnă de ei, lead-urile, reducerile, mesajele și contul, iar rândul familiei rămâne golit fiindcă facturile atârnă de el. **Nu e ștergerea logică din E04 S5** — aceea e o stare reversibilă pusă de admin; asta taie prin ea. Urma din audit log supraviețuiește, și trebuie: ține identificatori, nu nume
- [x] S5 · Bannerul de cookie-uri și blocarea scripturilor — **numai mecanica**; textele au plecat la E22 S2. Inventarul n-a găsit niciun script neesențial și un singur terț: harta Google, care pleca singură pe `loading="lazy"`. Deci poarta e la terț, nu peste tot — `MapEmbed.vue` ține `<iframe>`-ul în afara DOM-ului până apasă cititorul, iar `consentStore` ține alegerea în memorie, fără cookie. Fără banner pe site cât nu e nimic de refuzat; primul scop nou (analiza din E19 S8) îl aduce. Acceptanța rulează în CI: `pnpm test:privacy` pică dacă vreo pagină publică iese din origine sau pune un cookie
- [~] S6 · Managementul secretelor — **`pnpm secrets` rulează în CI** (secretlint, setul recomandat, peste tot ce urmărește git; nu găsește nimic, iar cheile plantate de probă le-a găsit pe toate), **rotația e scrisă** în `docs/secrete.md` — secret cu secret, unde stă și ce se strică la schimbare —, iar o cheie AWS statică îndreptată spre AWS scrie un avertisment la pornire. Rămâne confirmarea, din logul primului deploy, că stage-ul n-are nicio cheie statică
- [ ] S7 · Contracte de prelucrare
- [x] S8 · Evidența contractului de înscriere — contractul se semnează fizic; platforma reține doar că există și din ce zi. Coloana și completarea la înscriere/la confirmarea probei veniseră cu E11 S1; aici s-a livrat acceptanța: `PUT /enrollments/:id/contract` consemnează după (proba e refuzată, n-are contract), `GET /enrollments/without-contract` e lista înscrierilor active fără nimic pe fișă, `/admin/contracte` o arată cu un câmp de dată pe rând, fișa copilului și pagina grupei poartă „Fără contract", tabloul de bord numără. Fără versiune de text: contractul n-are încă a doua versiune

> **Granița cu E22 a fost tăiată pe tip, în septembrie 2026:** aici stă mecanica — inventarul,
> consimțământul, audit log-ul, exportul și ștergerea, bannerul, secretele, contractele de prelucrare
> —, acolo stă ce citește și acceptă familia: textele, termenul de păstrare, evidența acceptărilor.
> Tabelul complet e în capul epicului E07.

---

## Domeniu

### E08 · Multi-locație și săli — `livrat pentru MVP`

- [x] S1 · Entitățile de locație și sală
- [x] S2 · Corectarea constrângerii de unicitate
- [~] S3 · Grupa devine descriptibilă — are nume, sală, locație, capacitate. **Închis pentru MVP:** nivelul vine din E10 și profesorul din E09, ambele scoase din MVP
- [x] S4 · Locația în interfață
- [x] S5 · Migrarea datelor existente

> Facturile și plățile nu respectă selectorul de locație, intenționat: sunt legate de părinte, iar un
> părinte poate avea copii la ambele adrese.

### E09 · Personal și alocare — `scos din MVP`

- [ ] S1 · Entitatea de personal
- [ ] S4 · Profesor pe grupă — **fără relevanță în MVP**: toți cei care se autentifică sunt admini
- [ ] S6 · Disponibilitate
- ~~S2 · Roluri noi~~ — amânat: fără rol de profesor deocamdată, toți sunt admin
- ~~S3 · Restrângere pe locație~~ — amânat, cade odată cu rolurile
- ~~S5 · Invitație pentru personal~~ — amânat, cade odată cu rolurile

### E10 · Curriculum și catalog de module — `scos din MVP`

- [ ] S1 · Curs și modul
- [ ] S2 · Lecții și competențe
- [ ] S3 · Grupa predă un modul
- [ ] S4 · Trasee
- [ ] S5 · Catalog public

> Scos din MVP prin decizie: programa publicată părinților nu e necesară acum, iar facturarea pe
> modul nu e realitatea de azi. Nu e blocat tehnic — e depriorizat.

---

## Operațiuni

### E11 · Înscrieri, grupe și capacitate — `livrat`

- [x] S1 · Entitatea de înscriere — perioadă, istoric și starea; „o singură înscriere în vigoare" e index parțial, nu doar verificare în serviciu. `Child.group` rămâne, derivată
- [x] S2 · Contul de părinte: date complete, email confirmat, aprobat de admin — **revizuit și relivrat**: înregistrarea e în doi pași (cont, apoi profil), amândoi obligatorii, fiindcă zece câmpuri ca prim ecran sunt o barieră exact unde E20 coboară una. Nu e o întoarcere la starea de dinainte: pasul doi nu se poate sări, iar „complet" se derivă, nu se stochează — cele două porți, ecranul de aprobări, și blocarea înscrierii cât timp contul nu e activ
- [x] S3 · Capacitate și listă de așteptare — aplicată, probele numărate ca locuri; lista oferă automat locul eliberat, iar **ofertele expirate se mătură din oră în oră** (`expireLapsedOffers`): înainte, o ofertă fără răspuns ținea scaunul la nesfârșit, fiindcă se ofereau doar cererile `WAITING`. Familia căreia i-a expirat oferta e anunțată — i se spusese că are loc până joi. Excepția de capacitate lasă acum și un rând în jurnalul de audit, pe grupă — `GET /audit?entityType=Group&entityId=5` răspunde „cine a pus al unsprezecelea copil aici, și când" —, scris în tranzacția înscrierii; `enrol` și `transfer` poartă un `Actor`, iar `null` a rămas formularul public de probă, singurul apelant fără cont
- [x] S4 · Lecție de probă — ocupă un loc, apare distinct în catalog, se confirmă sau se închide. **Facturarea numără acum doar înscrierile active**, deci nici proba, nici un copil fără grupă
- [x] S5 · Transferuri — o singură tranzacție, starea și contractul trec mai departe. Efectul pe factură nu se afișează fiindcă prețul e per ședință și pe familie, nu pe grupă
- [~] S6 · Verificări de compatibilitate — vârsta, ca avertisment care cere confirmare. **Acceptat ca stare finală pentru MVP**; cerințele prealabile de modul aparțin lui E10, scos din MVP
- [~] S7 · Formarea grupelor — cererea neacoperită pe vârstă și locație, plus probele fără decizie. **Fără disponibilitatea profesorilor** (E09)

### E12 · Prezență, recuperări și orar — `în lucru`

- [x] S1 · Ședința ca entitate — livrat **redus**: fără modul și lecție, fiindcă E10 nu se face
- [x] S2 · Calendar de vacanțe — livrat: `NonTeachingPeriod`, ecranul `/admin/calendar` cu previzualizarea a ce se anulează, iar generatorul sare peste zilele închise, pe locație
- [x] S3 · Absențe anunțate — `AbsenceNotice` pe ședință, insigna și motivul în catalogul de pe telefon, `/user/absente` ca ecran de citit pentru părinte. Termenul: **luni la 12:00, pentru toată săptămâna**, ținut de birou — `inTime` se îngheață la scriere și **arată** dacă s-a respectat, dar nu poate fi poartă: de când notează adminul, spune când a tastat el, nu când a sunat familia. Rutele de anunțare și retragere sunt `ADMIN`, iar biroul le apasă din `/admin/absente`
- [x] S4 · Recuperări — **nu există credit de recuperare.** O coloană pe anunț (`replacement_session_id`): biroul mută copilul la altă grupă, manual, **în aceeași săptămână**. Fără jeton, fără expirare, fără programare din portal; ce oprește o mutare e ora oferită, care n-a început încă. Compatibilitatea e banda de vârstă, fiindcă modulele din E10 nu există. **Ecranul biroului e `/admin/absente`**: lista de luni pe săptămâni, mutarea dintr-o listă pe zile, anularea ei, și cifra celor de mutat în meniu
- [x] S5 · Anulări și mutări — ecranul `/admin/orar` (mută, anulează, reactivează), plus mesajul către familiile grupei la fiecare dintre cele trei, scris în aceeași tranzacție. La anulare nu se mai acordă nimic și nu se mai întreabă nimic: ora fără catalog nu se facturează nimănui (E15 S9), iar copiii mutați pe ea sunt eliberați și anunțați. Rămâne dispecerul, care pornește la E01 S4
- [~] S6 · Marcarea prezenței pe telefon — livrat fără poze (`Child` n-are câmp, e o decizie E07/E14): `/admin/attendance/azi`, salvare la fiecare apăsare, coadă locală pe rețea picată, buton „Sună părintele" la absență
- [~] S7 · Notificări — **mementoul de la minutul 15** (`@Interval` la 5 minute, fereastra se închide când se termină ora, o alertă per ședință) plus cel zilnic de la 10:00, amândouă către birou; și **unul singur** către părinte, trimis când biroul mută copilul, nu de un job. Mesajul de absență a fost scos prin decizie — catalogul uitat/târziu/greșit îl făcea nesigur când era inofensiv și alarmant când nu; cele două despre credite au plecat odată cu creditele. A doua linie către părinte nu mai e o datorie deschisă: aștepta rezumatele din E17 S6, iar acelea au fost construite și scoase prin decizie
- [x] S8 · Bifa de vacanță pe catalog — `ClassSession.isVacation`, `PUT /class-sessions/:id/vacation`, pusă din catalogul de pe telefon și din `/admin/orar`. Refuză ședințele anulate și lunile deja facturate. Faptul stă aici, regula de bani la E15 S9. **Nu se unește cu `NonTeachingPeriod`**: calendarul înseamnă „școala e închisă", bifa înseamnă „deschisă, dar în vacanță"
- [x] S9 · Recuperarea unei ore care nu se poate ține — sărbătoare legală, clădire închisă: adminul mută **toată grupa** într-o fereastră din aceeași săptămână. `POST /class-sessions/reschedule`, cheiat pe grupă și zi, dintr-un singur act din oricare stare de pornire: rândul programat se editează, cel anulat se editează și se pune la loc, cel negenerat se scrie — săptămâna rămâne cu un rând, familiile cu un mesaj. `GET /class-sessions/reschedule-windows` arată ferestrele libere pe grila școlii, la adresa grupei; regula de săptămână (`RESCHEDULE_OUT_OF_WEEK`) e verificată aici, nu în `moveSession`, prin decizie amânată. „Liber" înseamnă doar sala — profesorul nu se verifică, fiindcă E09 e scos din MVP

### E13 · Progres, evaluare și feedback — `scos din MVP`

- [ ] S1 · Evaluare pe competențe
- [ ] S2 · Observații
- [ ] S3 · Raport de final de modul
- [ ] S4 · Certificat
- [ ] S5 · Progresul în portal

> Scos din MVP prin decizie, din două motive: n-are pe ce sta — competențele și „finalul de modul"
> vin din E10, care e el însuși scos —, iar semnalul dintre înscriere și factură îl dă azi E14,
> proiectul copilului. Se reia odată cu E10.

### E14 · Proiectele elevilor — `livrat pentru MVP`

- [x] S1 · Modelul de proiect — fără instantaneu de consimțământ și fără `isPublic`; vin cu E07 S2
- [x] S2 · Agentul local și folderul oglindit — `apps/agent`, fără dependențe de runtime. Vizibilitatea pulsului da, **alertarea nu**: canalul e E06 S3 și nu există
- [x] S3a · Miniatură pentru imagini
- [x] S3b · Miniaturi pentru video și `.sb3` — **spike-ul are răspuns, și răspunsul e da**: un `.sb3` e un ZIP cu `project.json` în el, iar scena se desenează din fișier cu `sharp`-ul care era deja acolo, fără mașină virtuală Scratch și fără dependență nouă. Se desenează proiectul **așa cum a fost salvat**, nu cum arată după steagul verde — fără scripturi, fără rotire (doar oglindirea `left-right`), fără efecte. Cadrul din video iese prin ffmpeg, o secundă în clip și apoi chiar primul cadru pentru clipurile mai scurte; fișierul se scrie întâi pe disc, fiindcă drumul cu URL semnat există tocmai ca cele 200MB să nu treacă prin proces. Amândouă trec prin `ProjectThumbnailJob`, la cinci minute, cinci proiecte pe trecere, iar **coada lui e două coloane pe `projects`, nu o tabelă** — nu prin `outbox`, cum spunea story-ul scris înaintea cozii: acolo un rând e un mesaj cu destinatar și subiect. **Lipsa lui ffmpeg nu consumă încercarea niciunui proiect**, deci restanța se golește singură la primul tick de după instalare. Verificat pe ffmpeg adevărat. **Rămâne `apt install ffmpeg` pe instanță**, un pas de aprovizionare ca pinul PM2; `.sb3` merge fără el
- [x] S4 · Trimiterea către părinte — părinții fără adresă apar în raportul trimiterii, nu în evidența din E17 S5, care nu există
- [x] S5 · Galeria din portal — scrisă și testată; de la E01 S4 se poate și deschide, pe stage
- ~~S6 · Vitrina publică~~ — **scos din MVP:** două-trei lucrări puse de mână în paginile publice, ca orice alt conținut, fără backend și fără `isPublic`. Vitrina automată cerea oricum consimțământul din E07 S2; regula „se publică lucrarea, nu copilul" rămâne, iar acordul se cere înainte, chiar dacă la telefon
- [x] S7 · Corectarea unei atribuiri greșite — urma stă pe `Project`, nu în audit log-ul din E07 S3

> Complet specificat, gata de construit. Fluxul e: agent local pe calculatorul cu share-ul de rețea,
> profesorul salvează în folderul copilului, adminul revizuiește pe grupă și apasă trimite.

---

## Bani

### E15 · Pricing și facturare v2 — `în lucru; S1–S3 scoase`

- [x] S0 · Prețul pe ședință și ecranul de emitere — 87,50/62,50 per ședință, arbore familie→copii, zero se consemnează ca `waived`. Oricum s-ar calcula suma, **reducerile lunii se scad la final** — vezi E20 S5 pentru −50% și pentru ce trebuie verificat. **Facturarea pe modul a fost analizată și abandonată**, vezi caseta din epic
- ~~S1 · Catalogul de prețuri~~ — **scos:** cheia lui e modulul din E10, iar textul interzice explicit coloana de preț pe ședință, care e azi tot modelul. Dacă tarifele trebuie vreodată scoase din cod, e un story nou, pe ședință
- ~~S2 · Factura pe modul, cu linii~~ — **scos:** `Billing` există doar fiindcă S3 rupea o notă de plată în două facturi. Liniile de factură rămân o idee bună și n-au legătură cu modulele — story nou, când se face
- ~~S3 · Planuri de plată~~ — **scos:** factura lunară e deja plata în tranșe; nu mai există suma de 700 pe modul care să se rupă în două
- [x] S4 · Regula pentru mai mulți copii — 350 + 250 pe frate, într-un singur loc; ambele bug-uri reparate. Din E11/S4, suma numără doar copiii înscriși activ
- [~] S5 · Reduceri cu tip — **tipul livrat** (`fixed`/`percent`, plafon 100%, ecranul `/admin/reduceri`); scopul, condițiile și valabilitatea nu s-au construit, fiindcă n-au niciun client
- [x] S6 · Previzualizare și emitere în masă — previzualizarea e fișa din S0/S9, limita și raportarea pe factură sunt coada din E16 S3; ce lipsea era desenul: în `off` și `draft` fiecare familie era un PDF desenat și urcat cu tranzacția deschisă — **100 de familii în 8,2 s, acum în 0,38 s**. PDF-ul se desenează din rând la prima descărcare și se păstrează; poartă data emiterii (nu pe cea a desenării), scadența de 14 zile și reducerile în cuvinte, ca documentul SmartBill. O reducere pe o lună deja facturată e înghețată (`DISCOUNT_MONTH_INVOICED`): nu mai ajungea nicăieri, tăcut
- [~] S7 · PDF-ul nu se mai generează local — **în `live`, nu se mai generează** (livrat cu E16 S2): după emitere, PDF-ul fiscal se ia de la SmartBill și se pune la aceeași cheie din bucket, deci portalul, exportul și ștergerea îl citesc fără să știe cine l-a făcut. În `off` și `draft` rămâne PDF-ul local. Rămâne potrivirea la leu cu documentul SmartBill pe date reale, adică prima factură emisă live
- [x] S8 · Înscrierea la mijlocul unui modul — **rezolvat de modelul pe ședință**, nu de cod: cine intră pe 15 are mai puține ședințe în lună. Livrat aici: ecranul de emitere sortează familiile pe grupe, cum se și numără
- [x] S9 · Ședințele facturabile se numără din catalog — `billable-sessions.rules.ts` (regula pură) + `BillableSessionsService` (singura interogare, pe luna de predare din `teachingMonthRange`): ședință fără catalog = neținută, nefacturată; ținută = facturată întregii grupe, pe perioada înscrierii; de vacanță = doar celor marcați prezenți; proba și marcajele `make-up` niciodată. `POST /invoices/issue` nu mai primește numere de la client; `/admin/invoices/emitere` arată numărul citit, desfacerea lui și ședințele lunii fără catalog deasupra. **Corectura pe copil** (`SessionCountOverride`, `PUT|DELETE /invoices/overrides`): o decizie consemnată — cât, de ce, cine, când —, un rând per copil și lună, arătată pe fișă lângă numărul citit, zero = `WAIVED`, refuzată cu 409 după ce familia are factura lunii

> **Cele două bug-uri de preț sunt reparate**, iar testele care le documentau sunt acum teste de
> regresie. Regula, și sursa de adevăr pentru orice discuție despre prețuri: **350 de lei pentru
> primul copil și 250 pentru fiecare frate** — deci 600 la doi copii, 850 la trei —, iar unitatea
> reală e ședința, 87,50 și 62,50, așa că o lună scurtă costă mai puțin. Totul într-un singur loc,
> `apps/api/src/modules/invoice/pricing.ts`, verificat de `pricing.spec.ts`.

### E16 · Încasări și facturare prin SmartBill — `construit, așteaptă contul real`

- [~] S0 · Verificarea premisei — **contul există; SmartBill n-are sandbox, deci verificarea se face fără nicio factură**: `pnpm smartbill:check` citește doar cotele TVA și seriile (token, CIF, serie, numărul pe care l-ar lua prima factură), iar `--draft` trimite o singură ciornă — fără număr, nu e document fiscal — de privit în SmartBill Cloud și șters. **Rămâne rularea ei pe contul real**, cu seria nouă a platformei și cota TVA stabilită cu contabilul
- [x] S1 · Modelul de plată refăcut — sumă, metodă închisă, stare, referință de extras, cine a înregistrat-o; mulți-la-unu cu factura, starea facturii derivată din plățile reușite. Câmpurile SmartBill de pe factură au venit cu S2, unde le-a cerut integrarea
- [~] S2 · Emiterea prin SmartBill — **construit și testat pe un SmartBill fals, neatins pe contul real.** Trei moduri (`off` implicit, `draft` = ciorne, `live` = facturi; `live` pornește doar cu `NODE_ENV=production` și cu `SMARTBILL_LIVE_DB` care numește baza — stage rulează cu `NODE_ENV=stage` și trimite cel mult ciorne). Emiterea din platformă pune factura în coadă (`fiscalStatus`), iar documentul îl face un ceas, nu cererea. Fără cheie de idempotență la SmartBill, **proba e seria**: `nextNumber` scris pe rând înaintea cererii; un răspuns pierdut se judecă după serie — n-a mișcat, se retrimite; a mișcat, confirmă un om numărul, niciodată platforma singură. O factură emisă nu se mai șterge și nu-și schimbă suma din platformă; corectura e o stornare. A ieșit la iveală și defectul care ar fi produs documentul dublu: `updateInvoice` salva tot rândul, citit înaintea tranzacției
- [~] S3 · Emiterea în masă, temperată — **odată cu S2, pe aceleași rânduri**: cel puțin 400 ms între apeluri (limita reală e 30 la 10 secunde, nu 3 pe secundă), 20 de facturi pe trecere, câte una; la blocare nu se mai sună SmartBill deloc zece minute și nu se consumă încercări. Progresul — modul, stările, blocarea, eroarea pe rând — pe `/admin/invoices/[luna]`. Rămâne văzut pe o lună reală
- ~~S4 · Plata cu cardul în portal~~ — amânată; se încasează prin transfer sau numerar. **Dacă se reia, fără procesator integrat în platformă**: SmartBill are deja Netopia, EuPlătesc și Stripe, cu link de plată pe factură și încasare înregistrată singură acolo — condiția e ca starea plății să fie adusă înapoi din SmartBill (S8) înaintea linkului, altfel mementourile de restanță scriu unei familii care a plătit
- [~] S5 · Încasările: numerar și transfer bancar — **construit și testat pe un SmartBill fals, neatins pe contul real.** Ecranul: încasarea se începe din rândul de restanță, precompletată cu restul de plată. Propagarea: fiecare plată reușită pe o factură numerotată în SmartBill pleacă singură ca încasare (`POST /payment`) — numerarul ca chitanță pe `SMARTBILL_RECEIPT_SERIES`, transferul ca ordin de plată, fără document. Proba unui răspuns pierdut e suma încasată pe factură (`GET /invoice/paymentstatus`): neschimbată se retrimite, mișcată cu exact plata o confirmă un om. O plată din SmartBill se stornează, nu se șterge. Rămâne rularea pe contul real
- [~] S6 · Chitanțe și confirmări — **confirmarea livrată, documentul construit** odată cu S5: numerarul primește chitanța SmartBill, cu numărul pe plată și în portal, iar confirmarea duce la `/user/payments`, unde sunt factura fiscală și chitanța (API-ul n-are PDF de chitanță). Rămâne rularea pe contul real. Înregistrarea unei încasări nu mai e tăcută: chitanța se pune în coadă în aceeași tranzacție, cu două șabloane după cum factura e acoperită sau nu, iar restul de plată vine din recalculare, nu dintr-o a doua scădere. Se datorează când o plată **devine** `succeeded` — deci și la confirmarea unui transfer intrat ca `initiated` —, o singură dată pe plată
- [x] S7 · Restanțe — ecranul `/admin/restante` cu vechime, job zilnic care marchează și scrie (3 zile înainte, apoi săptămânal, tăcere după 60), termen de 14 zile derivat din data emiterii. Fără grupare pe locație: o familie poate avea copii la ambele adrese
- [~] S8 · Reconciliere și verificare — **construit și testat pe extrase de probă și pe un SmartBill fals.** Pe `/admin/reconciliere`: extrasul băncii (CSV, citit după capul de tabel, nu după o bancă anume; un import repetat nu adaugă nimic) cu propuneri după numărul fiscal al facturii (sigure, confirmate dintr-o apăsare) sau după nume și suma rămasă (câte una), fiecare confirmare fiind o plată ca oricare alta; și raportul de divergențe cu SmartBill — partea lor citită o dată pe zi, verdictul derivat la citire, cinci motive cu locul unde se repară. Rămâne primul extras real și rata lui de potrivire (acceptanța: peste 80%)

---

## Comunicare

### E17 · Comunicare și notificări — `livrat cât se poate fără deploy`

- [~] S1 · Furnizorul și livrabilitatea — parțial: `MailService` există în `apps/api`; SPF/DKIM/DMARC și partea de operare, nu
- [x] S2 · Șabloane — implicitele în cod, editările în `mail_templates`; ecranul `/admin/emailuri` cu previzualizare pe draft; mesajele de cont din E11 S2 mutate pe `render()`, cu variantă HTML
- [~] S3 · Coadă și reîncercare — parțial: outbox-ul e întreg și **rulează pe stage** de la E01 S4, într-un singur proces; fără cheie de trimitere acolo, mesajele se scriu și rămân. Prin el trece deja tot ce trimite backend-ul: mementourile de prezență și de recuperare din E12, restanțele din E16, mesajele de cont și locul eliberat din E11, proiectele din E14
- [x] S4 · Preferințe și dezabonare — comutatorul (`Profile.marketingOptIn`, implicit **false**) din setările părintelui, garanția că tranzacționalul nu-l consultă, și acum **calea de refuz din mesaj**, pe care acceptanța o cerea de la început: un jeton per familie (`select: false`, scris de un subscriber fiindcă jumătate din scriitori dau lui `save` un obiect simplu), footerul adăugat **în `queueMarketing`** ca un expeditor să nu-l poată uita, o rută publică ce comută într-o singură direcție și `/dezabonare`, unde scrierea e un `POST` fiindcă scanerele de mail deschid linkuri fără om. **Răstoarnă o notă de decizie („din settings, nu dintr-un link magic”) — motivele sunt în epic, iar patronul poate reveni.** Frecvențele rămân S6, scos
- [x] S5 · Evidența livrărilor — `GET /deliveries` + ecranul `/admin/livrari`; starea `undeliverable` cu motiv tipizat, deci un părinte fără adresă nu mai e sărit tăcut. Doar de citit, fără reîncercare manuală
- ~~S6 · Rezumate în loc de rafale~~ — **construit și scos prin decizie.** Un părinte nu se supără că primește trei emailuri într-o zi, iar motorul cerea ca fiecare mesaj să treacă printr-o stare în care nu a plecat și nu a eșuat — clasa de defecte care arată ca liniște. Gruparea care conta rămâne: **un mesaj per părinte, nu per copil**, în E12 S5 și S7, E14 S4 și E17 S7. Argumentul și ce ar trebui adus înapoi sunt scrise în epic
- [x] S7 · Anunțuri — `/admin/anunturi`: grupă, locație sau toată școala, un mesaj per **părinte**, previzualizare care randează mesajul adevărat și numără audiența pe felii, trimitere de test și confirmare. Anunțul își declară felul, iar cel promoțional e **primul expeditor de marketing** și respectă comutatorul din S4. Un text care numește un copil e avertisment cu confirmare, ca vârsta la E11/S6; același anunț de două ori în aceeași zi e refuzat de un index unic
- [x] S8 · Trimitere declanșată de admin — mecanica a venit cu E14 S4 (selecție pe grupă, desfacere per părinte, a doua apăsare sare ce a plecat, raport cu motivul pentru părintele fără adresă, `nou`/`trimis`/`eroare` pe document). Aici s-a închis riscul: restanța de documente se vede **cu vârstă**, nu doar ca număr — `ProjectService.pendingSummary` o deține, insigna din meniu o arată de pe orice ecran de admin, iar pragul pleacă pe sârmă ca propunere. Ecranul grupelor nu mai numără în browser. **Clauza de adunare peste apăsări a căzut** odată cu S6

> WhatsApp a ieșit din MVP prin decizie. Emailul e singurul canal.

---

## Public

### E18 · Frontend: design system și portal — `în lucru`

- [x] S1 · Fundația de design
- [x] S2 · Pipeline de imagini — `@nuxt/image`, WebP cu rezervă JPEG, `srcset` pe lățimile reale: **1056KB → 239KB**. AVIF măsurat și respins
- [x] S3 · Paginile publice
- [~] S4 · Portalul părintelui — **rescris pe sistemul din S1**: shell propriu (`layouts/portal.vue` — navbar plus rând de taburi, nu bara laterală de admin), Acasă / Prezența / Absențe / Proiecte / Plăți / Profil, cele trei ecrane de intrare în cont, și comutatorul de copil, care se păstrează între pagini și în URL. Rămâne verificarea pe date reale și pe telefon, care cere deploy-ul din E01 S4
- [x] S5 · Uniformizarea zonei de admin — **componentele livrate** (`AdminPage`, triada de stări, `AdminTable`, `AdminListRow`, `AdminFormActions`, `AdminConfirmModal`), pe un catalog al celor 7 dialecte de tabel și 5 de formular. **S5b, două felii:** meniul grupat pe șase secțiuni, `/admin/facturi` cu bani în loc de „Facturi: 10", lista de copii cu vârstă în loc de marca de timp brută, cardul de grupă mutat pe `occupancyOf` (D7); apoi încă paisprezece ecrane pe componente, patru `<select>` native și optsprezece `console.log` cu date de familii scoase — zece din ecrane, opt din magazine, composable-uri și pluginul de autentificare, unde scriau data de naștere a copilului și adresa familiei; un test ține linia, și al doilea drum de emitere (`invoices/new` + `invoices/preview/:month`) **șters**, fiindcă emitea o lună pe numere pe care nu se uitase nimeni. **41 din 44 de ecrane sunt pe componente** (numărătoarea veche, „26 din 43", era în urmă cu un fișier la fiecare capăt); al 44-lea, `/admin/absente` din E12 S3/S4, s-a născut pe ele. A treia trecere a adus cele cinci care cereau doar învelișul, plus trei care **nu spuneau nimic când încărcarea pica** — fișa familiei rămânea goală pentru totdeauna, istoricul de prezență se citea ca „copilul n-a venit niciodată", iar facturile lunii ca „nu sunt facturi" —, plus cele patru ecrane de grupe și ultimele două cu stări inventate — trei formulare salvau de **șase** ori la șase apăsări, măsurat, fiindcă rândul de butoane scris de mână n-avea `loading`; a plecat și ultimul `<select>` nativ din admin —, și a reparat **două butoane care nu se randau niciodată** — `AdminError` și `AdminFormActions` întrebau `useAttrs` despre un eveniment declarat, iar Vue îl scoate de acolo, deci retry-ul și anularea erau moarte de la început. `AdminDateField` a intrat pe cele două formulare de copil. **A patra trecere n-a citit codul, l-a condus**: cu API-ul mort în spatele unei sesiuni vii, nouăsprezece ecrane au fost întrebate ce arată. Trei mințeau — `/admin/payments` și `/admin/profiles` n-aveau `catch` deloc, deci un API inaccesibil se citea ca „nicio plată” și „nicio familie”, iar `/admin/calendar` prindea eroarea într-un toast care trece și lăsa pe ecran „niciun interval încă”. Și **cinci butoane de retry apăsau degeaba**: `load()` nu ștergea `loadError`, deci a doua încercare reușea, datele veneau, iar cardul de eroare rămânea deasupra lor — măsurat, apăsarea trimitea `GET /children`, primea 200, și ecranul nu se schimba. Alea sunt din story-ul care a adăugat butoanele, iar cititul nu le-ar fi găsit: butonul e acolo, e legat, și cheamă funcția care trebuie. Două măturări de sursă țin linia (`retry-clears-error.spec.ts`, `no-input-listener.spec.ts`). Ultimele două tabele scrise de mână au plecat și ele, iar migrarea lor a scos cinci șiruri englezești pe care le citește un om, o ștergere de plată fără confirmare și fără `await`, și o sortare care n-a sortat niciodată — `readonly` plus `sort` pe loc. **A cincea trecere a mers pe ecrane, nu prin cod**, și a găsit ce nu vede nicio poartă: catalogul își pierduse butonul de salvare la migrarea pe `AdminPage`, fiindcă `#footer` era slotul lui `UCard`. Poarta de accesibilitate acoperă acum **51 de ecrane**, cu id-uri reale pentru cele cu parametru — iar alea aduseseră șase încălcări proprii, printre care butoanele de prezență fără nume. A șasea trecere a închis story-ul: **bara de filtre** și **grila de carduri**, ultima dovedindu-se un singur card desenat de opt ori (`AdminStatTile`) — iar ce diferea între ele era elementul, adică ce face cardul: `div` un fapt de citit, legătură ceva de acționat, buton un filtru. Componenta îl alege din props, deci un card nu mai poate ajunge un `div` cu `@click`. Aceeași trecere a găsit, conducând ecranele, trei lucruri pe care nicio poartă nu le vede: **paisprezece butoane „Luna anterioară"** pe un ecran cu o singură lună, „Alege data din calendar" de trei ori pe `/admin/contracte` și **„Show popup" pe 44 de ecrane** — implicitul englezesc al lui reka-ui, intrat dintr-un singur `USelectMenu` neetichetat din navbar; **textul erorii venit de la ofetch**, în engleză și cu adresa API-ului în el, arătat oricui pica rețeaua, pe toate ecranele de admin deodată, găsit citind ce scrie pe cardul de eroare, nu că apare; și **`hover:bg-gray-50`**, care făcea rândul unui copil ilizibil în tema întunecată, unde axe n-are cum să ajungă fiindcă nimic nu trece cu cursorul. Plus `/admin/attendance/group`, primul pas al marcării, fără încărcare, eroare sau stare goală — cu cererea de dedesubt prinsă, deci calea de eșec gândită pentru a doua și ratată pentru prima. Poarta autentificată numără acum și numele controalelor: niciun `aria-label` repetat pe un ecran, niciunul în engleză
- [x] S6 · Accesibilitate — **verificarea automată rulează în CI, pe ambele părți**: axe-core într-un Chromium adevărat, în ambele teme, pe WCAG 2.0 și 2.1 A+AA — `pnpm test:a11y` pe fiecare pagină din sitemap, `pnpm test:a11y:auth` pe cele 51 de ecrane din spatele autentificării, într-un job propriu fiindcă îi trebuie bază de date, seed și un API care răspunde. Prima rulare autentificată: 80 de încălcări, patru cauze, toate în cod partajat. Cele 14 ecrane cu parametru au intrat și ele, cu id-uri reale cerute de la API, deci poarta trece prin toate cele 51. Lângă axe rulează acum două verificări de nume pe care axe nu le are: niciun `aria-label` repetat pe un ecran, niciun control numit în engleză
- [x] S7 · Interfața profesorului — fără rol separat, e o vedere din zona de admin, nu o zonă a ei. Măsurat la 390px: **meniul era acoperit de filtrul de locație** (10px din 44 apăsabili), accentul lui Nuxt UI rămăsese la 2,61:1 de partea autentificată, iconițele veneau de la Iconify la rulare, iar coada aștepta un `online` care nu vine pe conexiunea din sală

### E19 · SEO, GEO și conținut — `în lucru`

- [x] S1 · Fundația tehnică
- [x] S2 · Date structurate
- [x] S3 · Pagini locale — livrat pe site, **iar cele două profiluri Google Business sunt create**, unul per adresă
- [!] S4 · Pagini de modul — așteaptă E10, care e scos din MVP
- [~] S5 · Performanță — livrat odată cu E18 S2; rămâne confirmarea pe trafic real — domeniul e live, deci ce lipsește sunt săptămânile de vizite din raportul Core Web Vitals
- [!] S6 · Conținut — blocat de „cine scrie textele"
- [x] S7 · Pregătire pentru motoare generative
- [~] S8 · Măsurare — **Search Console e configurat pe ambele proprietăți**, cu linia de bază consemnată în epic. Analiza de trafic nu mai e blocată: E07 S5 i-a construit poarta, deci de aici e o alegere de unealtă
- [x] S9 · Legături rupte — `pnpm test:links` peste paginile din sitemap, lângă verificarea de accesibilitate și cea de terți, cu care împarte serverul și browserul. Linkurile se citesc din pagina randată; țintele n-au de ce să fie în sitemap (`/auth/login` e legat din navigație și dinadins în afara lui); fragmentele se verifică pe id-urile paginii-țintă, jumătatea pe care un 200 n-o vede. Prima rulare: 240 de linkuri interne, toate 200

> Lucrul cel mai valoros rămas aici nu e cod. Pentru căutările locale, cele două profiluri Google
> Business contează mai mult decât orice a rămas de scris în repo.

### E20 · Achiziție, lecții de probă și lead management — `în lucru`

- [x] S1 · Modelul de lead — `Lead` cu sursă, canal declarat, responsabil și dată de urmărire. **Patru din cele șase stări nu se scriu de la niciun ecran**: vin din programare, din catalog și din rezolvarea probei în E11, iar `UpdateLeadDto` n-are câmp `status`
- [~] S2 · Programare la lecție de probă — `/proba` plus `GET /trial/slots` și `POST /trial/bookings`, **singurele rute publice în afară de autentificare**. Fără cont, dar cu loc real: scrie profil-coajă, copil și înscriere `TRIAL` prin `EnrollmentService`, într-o tranzacție. Grupa plină nu se oferă, iar locul luat între timp nu dă eroare, ci un lead. **Rămâne** doar aducerea paginii pe `release/prod`, care cere backend deployat (E01 S4)
- [x] S3 · Urmărire — `/admin/leads` în ordinea a cât costă pierderea unei familii, plus mesajul zilnic de la 09:00, mementoul cu o zi înainte de probă și recontactarea după neprezentare. „Probă ținută" o pune catalogul, nu o bifă; nicio cerere nu iese fără motiv scris
- [x] S4 · Măsurarea pâlniei — fila „Pâlnia" din `/admin/rapoarte`. Cohortă după data cererii, trecere nu ocupare, mediana până la decizie lângă conversia probă→înscriere, și cererile fără loc numărate separat, fiindcă nu intră în nicio rată
- [x] S5 · Recomandări — **redus prin decizie și livrat astfel**: 50% de fiecare parte, fără cod, fără link, fără atribuire automată — deci nici măsurare a canalului. Acordarea e **un `−  n luni  +` în profilul familiei**: fiecare apăsare pe `+` e încă o lună la 50%, `−` o ia pe ultima înapoi, iar luna o alege serverul pe ceasul școlii. A doua apăsare dă **a doua lună**, nu o reducere mai mare pe aceeași — două procente pe o lună o fac gratuită. `/admin/reduceri` rămâne pentru orice altă reducere și pentru ștergere

> Formularul de contact rămâne pe email, prin decizie: nu scrie lead, nu atinge backend-ul.

---

## Business

### E21 · Raportare și analytics — `livrat cât cere MVP-ul`

- [~] S1 · Tablou de bord operațional — livrat pe `/admin/dashboard`, care era un placeholder. Fiecare număr e cerut de la serviciul care deține întrebarea, iar e2e-ul verifică acordul cu ecranele rezumate. Fără filtrare pe locație și fără comparație cu perioada anterioară
- [x] S2 · Rapoarte financiare — `/admin/rapoarte`, fila „Bani": facturat față de încasat pe lună, cu **două calendare** (pentru lună / în lună), numerar și transfer, restanțele pe benzi cerute de la `ArrearsService`. Fără modul (E10) și fără locație (factura e a familiei); potrivirea cu contabilul așteaptă date reale
- ~~S3 · Retenție și abandon~~ — **scos din scop:** acceptanța cere modulul (E10) și profesorul pe grupă (E09), amândouă scoase, deci cele două axe pe care se citește rata nu există. E retenția **copiilor**, nu a datelor — aia e E04 S5 și E22 S3
- [x] S4 · Ocupare — fila „Locuri": grupe cele mai goale primele, săli cu orele moarte măsurate pe orarul școlii, totaluri pe adresă. Ocupatul vine din `occupancyOf`, probele incluse; pragul de 60% și venitul pierdut la preț de listă sunt propuneri, afișate ca atare
- [x] S5 · Pâlnia — **livrat în celălalt epic**, ca E20 S4: fila „Pâlnia" din `/admin/rapoarte`, servită de `GET /reports/funnel`. Rămân două jumătăți de acceptanță fără intrare, nu fără cod: costul de achiziție cere o cheltuială de marketing pe care n-o înregistrează nimeni, iar „familii care rămân" cere S3
- ~~S6 · Export pentru contabil~~ — **scos din scop:** contabilul își ia datele din SmartBill, unde facturile există oficial. Un export din baza noastră ar fi a doua versiune a acelorași cifre. Se repune dacă E16 S0 iese prost și emiterea rămâne la noi
- [x] S7 · Semnale timpurii — fila „Semnale" din `/admin/rapoarte` (`GET /reports/signals`) plus un mesaj către birou luni la 08:00, doar când e ceva de semnalat. Patru liste, fiecare de la cine deține definiția: copii cu ultimele trei marcaje absente (regulă nouă, pură, în `signals.rules.ts`, cu absențele anunțate numărate separat), grupe cu media ultimelor trei ședințe cu 20 de puncte sub cele trei dinainte, familii cu două facturi peste termen (`ArrearsService`), grupe sub prag (rândurile raportului de ocupare). Pragurile sunt propuneri și vin în răspuns. **„Verificat retroactiv" e `asOf`** — marcajele și facturile așa cum stăteau într-o zi din trecut; pe istorii scrise de mână în teste, fiindcă istoric real nu există până la deploy. Fără nicio acțiune automată: un semnal e un motiv de telefon

---

## Ce așteaptă pe cineva

Niciun blocaj nu e de cod. În ordinea a cât deblochează:

| Cine           | Ce                                | Ce ține în loc                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tu**         | Producția pe `release/prod`       | Ce mai cere **domeniul real**: pagina publică din E20 S2 și E04 S4 (proba de restaurare). Stage rulează, deci verificarea lui E18 S4, migrarea din S5 și scheduler-ul din E17 se pot face azi, pe `stage.itbridgeschool.com`                                                                                                                                                                   |
| **Tu**         | `apt install ffmpeg` pe instanță  | Jumătatea de video din E14 S3b. Un pachet, ca pinul PM2 — codul e livrat și nu se schimbă, iar restanța de videouri se desenează singură la primul tick de după. `.sb3` nu așteaptă nimic                                                                                                                                                                                                      |
| **Tu**         | SmartBill: token, serii, TVA      | Rularea lui E16 S0 pe contul real: `pnpm smartbill:check` cu tokenul în `.env`, o serie de facturi și una de chitanțe doar ale platformei, cota TVA stabilită cu contabilul și o ciornă privită și ștearsă (`--draft`, plus `--draft --receipt`). Apoi un extras al băncii exportat ca CSV, pentru rata de potrivire din S8. Codul e gata și nu trimite nimic până atunci — implicitul e `off` |
| **Tu**         | Datele anului școlar din ordin    | Nimic. Ecranul E12 S2 există; intervalele se tastează în `/admin/calendar` o dată pe an                                                                                                                                                                                                                                                                                                        |
| **Școala**     | Programa și calendarul vacanțelor | E19 S4. **Nu mai blochează facturarea** — prețul e pe ședință, numărate lunar                                                                                                                                                                                                                                                                                                                  |
| **Școala**     | Termenele de păstrare din nota §7 | Nimic nu stă: jobul din E22 S3 rulează cu propunerea de 12 luni. Ce se cere e confirmarea numerelor înainte ca nota să fie publicată — și a regulii noi: o familie care datorează bani nu se șterge la termen                                                                                                                                                                                  |
| **Cine scrie** | Conținutul paginilor              | E19 S6                                                                                                                                                                                                                                                                                                                                                                                         |

## Ce urmează

**Pentru site-ul public**, ce mai stă între azi și o lansare fără rezerve e în
[`docs/lansare.md`](../lansare.md), punct cu punct: bannerul, textele, legăturile, HSTS, cifra pe
trafic real, analiza. Restul secțiunii e despre platformă.

**Instanța EC2 există, și stage rulează pe ea.** Portalul părintelui, prezența și facturile sunt de
azi lucruri pe care le poate deschide cineva, pe `stage.itbridgeschool.com` — pe date de seed, dar
într-un browser, pe un telefon, la o adresă. Ce rămâne din E01 S4 e producția, iar aia nu se
deblochează cu infrastructură: `release/prod` poartă API-ul de dinainte de E08.

**În paralel:** jumătatea de componente din E18 S5 e făcută, iar bucla banilor e închisă cât se poate
fără SmartBill — se emite (E15 S0), se vede cine n-a plătit (E16 S7) și se încasează de acolo
(E16 S5). **E16 e construit întreg** odată cu deblocarea contului: S0 ca unealtă fără niciun document
fiscal, S2 și S3 ca o coadă care nu emite de două ori, S5 și S6 ca aceeași coadă pentru încasări, S8
ca extrasul potrivit cu facturile și raportul de divergențe. Din el nu mai rămâne cod, ci rularea pe
contul real și primul extras al băncii. **E17 nu mai are story-uri deschise:** S7 și S8 sunt livrate, iar S6
a fost construit și scos prin decizie.

E11 e închis. Ce a rămas parțial din el — cerințele prealabile de modul la S6, disponibilitatea
profesorilor la S7 — depinde de E10 și E09, nu de E11.

**După tăietura de scop din 6 septembrie, tot ce mai stă între azi și un MVP folosibil încape în
trei rânduri:**

1. **Platforma pe `release/prod`** — restul lui E01 S4. Deploy-ul există și merge, pe stage; ce
   lipsește e decizia și munca de a duce platforma pe branch-ul de producție, fiindcă acolo stă încă
   API-ul de dinainte de E08. Verificările care aveau nevoie doar de „undeva unde rulează" se pot
   face de acum pe stage.
2. **SmartBill** — E16. Contul există, iar tot epicul e construit și așteaptă contul real: întâi
   `pnpm smartbill:check` (doar citiri), o serie de facturi și una de chitanțe doar ale platformei,
   cota TVA de la contabil și o ciornă privită și ștearsă — apoi `SMARTBILL_MODE=live` pe producție,
   singurul loc unde are voie (`NODE_ENV=production`; pe stage, `NODE_ENV=stage` și cel mult
   `draft`). Nu mai e nimic de scris: rămân prima lună emisă live, potrivită la leu cu documentul
   lor, și primul extras real, pentru rata de potrivire din S8.
3. **Termenii, E22 S2** — condiția de ieșire, și singura care nu se poate cumpăra cu timp de
   programare: fără ei nu se deschide accesul familiilor. Termenele de păstrare din §7 sunt de acum
   cod (E22 S3), deci ce rămâne din ele e confirmarea numerelor, nu munca.

Restul deschis e polish cu proprietar clar: SPF/DKIM/DMARC din E17 S1 și conținutul de la E19 S6.
**E18 S5b s-a închis** — bara de filtre și grila de carduri erau ultimele două, iar grila s-a
dovedit un singur card desenat de opt ori. **Și E14 s-a închis**, cu S3b: din el nu mai rămâne cod,
ci un pachet instalat pe instanță. Niciunul nu blochează pe altcineva.

### E22 · Termeni, confidențialitate și ciclul de viață al datelor — `în lucru`

- ~~S1 · Inventarul a ce se stochează~~ — **mutat la E07 S1.** Era același tabel scris de două ori; cel care ajunge sub ochii unei familii ar fi fost tocmai cel rămas în urmă
- [~] S2 · Termenii contului și nota de confidențialitate — **condiția de ieșire a platformei**: fără ei nu se deschide accesul familiilor. Absoarbe și textele de vizitator — confidențialitate, cookie-uri — din fostul E07 S5. **Ciornă 0.1 în `docs/legal/`**: cele trei texte plus README-ul cu sursa fiecărui fapt; scrise din entități și verificate clauză cu clauză contra legii (tabelul e în README); neverificate de avocat, cu faptele lipsă și deciziile propuse marcate `[[…]]`. Al patrulea, acordul pentru lucrările copilului, a venit cu E07 S2 și trece pe la avocat odată cu ele. **Pagini pe stage**: `/termeni`, `/confidentialitate`, `/cookies`, `/acord-lucrari`, randate din aceleași fișiere
- [x] S3 · Termenul de păstrare, și ștergerea care chiar șterge — **12 luni de la retragere**, propunere din nota §7 până o confirmă școala, într-o singură constantă. Un job de noapte șterge familiile ajunse la termen prin ștergerea din E07 S4 (jurnalul spune că a fost calendarul), mai puțin cele care datorează bani; tot atunci pleacă cererile de probă fără înscriere (cu profilul-coajă), copiile mesajelor de peste un an și linkurile expirate de peste o lună. `/admin/stergeri` arată cine urmează și ce îl ține; un e2e arată că o familie retrasă acum 13 luni nu mai are nimic personal în platformă
- [x] S4 · Evidența acceptărilor — **ambele jumătăți**. Bifa la înregistrare (`acceptedTerms`, refuzată fără), un rând per document în `document_acceptances` cu versiunea, spec care ține constanta egală cu capul fișierului. Plus **a doua bifă**, separată, pentru clauzele pe care Codul civil art. 1203 le numește neuzuale — §14, §15, §18 — cu rând propriu care poartă versiunea termenilor, și cu titlurile documentelor legate prin id-uri, ca bifa să ducă la textul pe care îl acceptă. Plus **re-acceptarea la versiune nouă**, pe care termenii §18 o promit: `GET /auth/me` spune ce lipsește (derivat pe server, ca `profileComplete`), portalul duce la `/user/termeni-noi`, iar `POST /auth/accept-documents` scrie numai ce lipsește și refuză o listă incompletă. Nicio rută nu refuză o cerere pentru asta, dinadins: §18 promite că portalul cere, nu că platforma se închide. Plus **§4.7**: evidența se recitește din Profil (`GET /auth/documents`), iar fiecare acceptare primește un email de confirmare care numește ce s-a acceptat în actul acela, o singură dată. Textul unei versiuni înlocuite devine de făcut la prima versiune nouă de după publicare

> Ultimul prin decizie: termenii descriu ce face platforma, deci se scriu după ce platforma nu-și
> mai schimbă forma. Scris prea devreme, un asemenea document e o minciună întreținută.

---

Când se schimbă starea unui story, se schimbă întâi în epicul lui și abia apoi aici — altfel fișierul
ăsta devine a doua sursă de adevăr, adică exact lucrul pe care restul documentației îl evită.

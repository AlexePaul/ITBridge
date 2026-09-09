# Tracker

Starea fiecărui story, la zi. Sursa e antetul și notele de livrare din fiecare epic; aici sunt doar
adunate într-un loc.

**Ultima actualizare:** 9 septembrie 2026, pe `release/stage`. **S-a închis E07 S4**, exportul și
ștergerea la cerere: o familie își descarcă din portal tot ce ține școala despre ea și despre copiii
ei, și tot de acolo poate cere ștergerea contului — pe care biroul o duce la capăt dintr-un ecran
propriu, în cel mult 30 de zile, păstrând doar facturile. Nu e ștergerea logică din E04 S5: aceea e
o stare reversibilă pusă de admin, asta taie prin ea. **Și E07 S1**, inventarul de
date: toate cele 231 de coloane clasificate, 99 dintre ele date personale, cu temeiul, termenul și
cititorul scrise la fiecare — iar propoziția din acceptanță („o coloană nouă nu poate ajunge în
producție fără să apară în el") e ținută de un test care citește metadatele lui TypeORM, nu o listă.
Documentul din care E22 S2 va scrie nota de confidențialitate e randat din același fișier și
verificat că nu rămâne în urmă. Tot azi, **s-a livrat jumătatea de bani din
E07 S3**, audit log-ul: facturi, plăți și reduceri lasă fiecare o urmă cu cine, ce a fost și ce a
devenit, scrisă în tranzacția schimbării pe care o descrie și fără nicio cale de a o edita sau
șterge; „cine a schimbat suma facturii 412 și când" e o cerere. Datele personale rămân neconsemnate
până se decide ce se păstrează despre ele. Tot azi, **s-a închis E18 S5b** — bara de filtre și grila de carduri, ultima fiind un singur card desenat de opt ori; aceeași trecere a scos numele de control repetate și englezești, textul de eroare al lui ofetch arătat utilizatorului și culorile fără temă întunecată. **A intrat lista de lansare**,
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

Din **150 de story-uri** în 22 de epicuri: 83 livrate, 22 parțiale, 4 blocate, 12 scoase din
scop, 29 neîncepute — a se citi cu legenda de mai sus, fiindcă „parțial" înseamnă adesea „construit,
dar n-a fost văzut pe date reale".

**Cifrele s-au recitit din rânduri, și cinci din șase erau greșite** — 75/19/6/36 pentru
81/21/4/32. Nota dinainte spunea că sunt numărate din rândurile de mai jos; erau, o dată, iar de
atunci au fost ținute de mână peste fiecare livrare, adică exact ce spunea că nu mai sunt. Se
renumără așa, și merită scris fiindcă are o capcană: rândurile de story sunt cele care încep în
coloana întâi cu `- [x]`, `- [~]`, `- [!]`, `- [ ]` sau `- ~~`, **numărate doar după primul titlu
`### E`** — altfel intră în total și rândul din legendă care arată cum se scrie un story tăiat, iar
numărul iese cu unul peste, ceea ce e greu de observat tocmai fiindcă e aproape.

Cele 29 neîncepute se citesc și ele cu grijă: **19 dintre ele stau în epicuri scoase din MVP** — E06,
E09, E10 și E13 — deci nu sunt lucru amânat de pe o săptămână pe alta, ci lucru scos din val. Ce a
mai rămas de făcut pentru MVP e în [Ce urmează](#ce-urmează).

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
- [~] S2 · Migrările în deploy — comenzile și garda de CI există; cablarea în deploy nu, fiindcă nu există deploy
- [x] S3 · Seed pentru dezvoltare **și pentru staging** — **ancorat la ziua de azi**, nu la o constantă din martie: grupele acoperă luni–sâmbătă, deci „azi" are oră în șase zile din șapte. Lead-uri pe toate cele șase stări, outbox pe toate cele patru, anunțuri, absențe anunțate, credite de recuperare și șabloane — șase tabele care se deschideau goale. `pnpm seed:stage` populează staging-ul din `.env.stage`, dar numai dacă `SEED_ALLOW_NON_LOCAL` **numește baza** (nu `1`, care ar autoriza orice ar scrie `DB_NAME` luna viitoare) și `SEED_PASSWORD` e setată — `parola123` e în repo, iar staging-ul e la îndemâna oricui știe hostname-ul
- [~] S4 · Backup și restaurare — `pg_dump` zilnic la 03:15 din cron pe instanță, în S3, cu ținte separate per mediu și retenție pe o regulă de lifecycle; un dump gol nu se urcă. **Proba de restaurare, cu durata măsurată, rămâne condiția de închidere** — și de acum se poate face
- [!] S5 · Retenție — **decis**: ștergere logică pe contul familiei, aplicată de admin la retragere; facturile n-au nevoie de politică, stau în SmartBill. Blocat de termenii din E22, fiindcă „când dispar efectiv datele" cere un termen scris undeva unde familia l-a văzut

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

### E07 · Securitate, GDPR și consimțământ — `în lucru; S1, S4, S5 și S8 livrate, S3 pe jumătate, restul propus`

- [x] S1 · Inventar și clasificare — **singurul inventar**; E22 S2 îl citește, nu îl reface. Toate cele **231 de coloane** din cele 30 de tabele sunt clasificate, nu doar cele personale: fiecare e ori dată personală cu cele cinci răspunsuri, ori nu e, cu un motiv numit — **99 sunt date personale**, în 22 de tabele. Sursa e `apps/api/src/privacy/data-inventory.ts`, documentul [`docs/inventar-date.md`](../inventar-date.md) e randat din ea, iar `data-inventory.spec.ts` citește metadatele lui TypeORM și pică pe o coloană neclasificată, pe un rând învechit, pe un scop gol, pe document rămas în urmă și pe un `linkedVia` care nu duce la `Profile` — drumul pe care îl va parcurge S4. Termenele rămân ale E22 S3, dar acum sunt cinci reguli de numerotat, nu 231 de câmpuri
- [ ] S2 · Consimțământ parental — granularitate `(părinte, copil, scop)`, decisă
- [~] S3 · Audit log — **jumătatea de bani**: `audit_log` plus `apps/api/src/modules/audit/`, legat în facturi, plăți și reduceri, cu rândul scris în tranzacția schimbării pe care o descrie și fără nicio cale de a-l edita sau șterge. Acceptanța rulează capăt-la-capăt: `GET /audit?entityType=Invoice&entityId=412` spune cine a schimbat suma și când. **Lipsesc datele personale** — `Profile` și `Child` n-au urmă, fiindcă acolo _valoarea_ e data personală și „ce câmp" contra „din ce în ce" e o decizie de luat, nu o completare de scris
- [x] S4 · Export și ștergere — **ambele fluxuri**. Exportul: `GET /privacy/export` întoarce tot ce ține școala despre familia care cere, cu buton pe `/user/profile`; fără `:id` pe ruta părintelui (profilul vine din token), fără niciun hash întors, fără nimic despre altă familie. Ștergerea: familia cere din portal, biroul o duce la capăt din `/admin/stergeri`, în cel mult 30 de zile; dispar copiii cu tot ce atârnă de ei, lead-urile, reducerile, mesajele și contul, iar rândul familiei rămâne golit fiindcă facturile atârnă de el. **Nu e ștergerea logică din E04 S5** — aceea e o stare reversibilă pusă de admin; asta taie prin ea. Urma din audit log supraviețuiește, și trebuie: ține identificatori, nu nume
- [x] S5 · Bannerul de cookie-uri și blocarea scripturilor — **numai mecanica**; textele au plecat la E22 S2. Inventarul n-a găsit niciun script neesențial și un singur terț: harta Google, care pleca singură pe `loading="lazy"`. Deci poarta e la terț, nu peste tot — `MapEmbed.vue` ține `<iframe>`-ul în afara DOM-ului până apasă cititorul, iar `consentStore` ține alegerea în memorie, fără cookie. Fără banner pe site cât nu e nimic de refuzat; primul scop nou (analiza din E19 S8) îl aduce. Acceptanța rulează în CI: `pnpm test:privacy` pică dacă vreo pagină publică iese din origine sau pune un cookie
- [ ] S6 · Managementul secretelor
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
- [x] S3 · Capacitate și listă de așteptare — aplicată, probele numărate ca locuri; lista oferă automat locul eliberat, iar **ofertele expirate se mătură din oră în oră** (`expireLapsedOffers`): înainte, o ofertă fără răspuns ținea scaunul la nesfârșit, fiindcă se ofereau doar cererile `WAITING`. Familia căreia i-a expirat oferta e anunțată — i se spusese că are loc până joi. Rămâne jurnalul de audit al excepției de capacitate: tabelul există de la E07 S3, dar `enrol` poartă un `actingUserId`, nu un `Actor`, iar unul dintre apelanți e formularul public de probă, care n-are niciunul — deocamdată excepția lasă o linie în log
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

### E14 · Proiectele elevilor — `în lucru`

- [x] S1 · Modelul de proiect — fără instantaneu de consimțământ și fără `isPublic`; vin cu E07 S2
- [x] S2 · Agentul local și folderul oglindit — `apps/agent`, fără dependențe de runtime. Vizibilitatea pulsului da, **alertarea nu**: canalul e E06 S3 și nu există
- [x] S3a · Miniatură pentru imagini
- [!] S3b · Miniaturi pentru video și `.sb3` — cere ffmpeg pe host, deci deploy
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
- [ ] S6 · Previzualizare și emitere în masă
- [ ] S7 · PDF-ul nu se mai generează local
- [x] S8 · Înscrierea la mijlocul unui modul — **rezolvat de modelul pe ședință**, nu de cod: cine intră pe 15 are mai puține ședințe în lună. Livrat aici: ecranul de emitere sortează familiile pe grupe, cum se și numără
- [x] S9 · Ședințele facturabile se numără din catalog — `billable-sessions.rules.ts` (regula pură) + `BillableSessionsService` (singura interogare, pe luna de predare din `teachingMonthRange`): ședință fără catalog = neținută, nefacturată; ținută = facturată întregii grupe, pe perioada înscrierii; de vacanță = doar celor marcați prezenți; proba și marcajele `make-up` niciodată. `POST /invoices/issue` nu mai primește numere de la client; `/admin/invoices/emitere` arată numărul citit, desfacerea lui și ședințele lunii fără catalog deasupra. **Corectura pe copil** (`SessionCountOverride`, `PUT|DELETE /invoices/overrides`): o decizie consemnată — cât, de ce, cine, când —, un rând per copil și lună, arătată pe fișă lângă numărul citit, zero = `WAIVED`, refuzată cu 409 după ce familia are factura lunii

> **Cele două bug-uri de preț sunt reparate**, iar testele care le documentau sunt acum teste de
> regresie. Regula, și sursa de adevăr pentru orice discuție despre prețuri: **350 de lei pentru
> primul copil și 250 pentru fiecare frate** — deci 600 la doi copii, 850 la trei —, iar unitatea
> reală e ședința, 87,50 și 62,50, așa că o lună scurtă costă mai puțin. Totul într-un singur loc,
> `apps/api/src/modules/invoice/pricing.ts`, verificat de `pricing.spec.ts`.

### E16 · Încasări și facturare prin SmartBill — `în lucru`

- [ ] S0 · Verificarea premisei — abonamentul Facturare Platinum, înainte de orice cod
- [x] S1 · Modelul de plată refăcut — sumă, metodă închisă, stare, referință de extras, cine a înregistrat-o; mulți-la-unu cu factura, starea facturii derivată din plățile reușite. **Fără câmpurile SmartBill de pe factură** — alea așteaptă S0
- [ ] S2 · Emiterea prin SmartBill
- [ ] S3 · Emiterea în masă, temperată — 3 apeluri pe secundă
- ~~S4 · Plata cu cardul în portal~~ — amânată; se încasează prin transfer sau numerar
- [~] S5 · Încasările: numerar și transfer bancar — **jumătatea de ecran**: încasarea se începe din rândul de restanță, precompletată cu restul de plată, iar `/admin/payments/new` e lista facturilor care mai au ceva de plată, nu un formular gol. Propagarea în SmartBill așteaptă S0
- [~] S6 · Chitanțe și confirmări — **confirmarea livrată**, documentul fiscal nu (îl blochează S0). Înregistrarea unei încasări nu mai e tăcută: chitanța se pune în coadă în aceeași tranzacție, cu două șabloane după cum factura e acoperită sau nu, iar restul de plată vine din recalculare, nu dintr-o a doua scădere. Se datorează când o plată **devine** `succeeded` — deci și la confirmarea unui transfer intrat ca `initiated` —, o singură dată pe plată
- [x] S7 · Restanțe — ecranul `/admin/restante` cu vechime, job zilnic care marchează și scrie (3 zile înainte, apoi săptămânal, tăcere după 60), termen de 14 zile derivat din data emiterii. Fără grupare pe locație: o familie poate avea copii la ambele adrese
- [ ] S8 · Reconciliere și verificare

---

## Comunicare

### E17 · Comunicare și notificări — `livrat cât se poate fără deploy`

- [~] S1 · Furnizorul și livrabilitatea — parțial: `MailService` există în `apps/api`; SPF/DKIM/DMARC și partea de operare, nu
- [x] S2 · Șabloane — implicitele în cod, editările în `mail_templates`; ecranul `/admin/emailuri` cu previzualizare pe draft; mesajele de cont din E11 S2 mutate pe `render()`, cu variantă HTML
- [~] S3 · Coadă și reîncercare — parțial: outbox-ul e întreg și **rulează pe stage** de la E01 S4, într-un singur proces; fără cheie de trimitere acolo, mesajele se scriu și rămân. Prin el trece deja tot ce trimite backend-ul: mementourile de prezență și de recuperare din E12, restanțele din E16, mesajele de cont și locul eliberat din E11, proiectele din E14
- [~] S4 · Preferințe și dezabonare — comutatorul (`Profile.marketingOptIn`, implicit **false**) din setările părintelui, plus garanția că tranzacționalul nu-l consultă. Frecvențele sunt S6, iar expeditor de marketing încă nu există
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

| Cine           | Ce                                | Ce ține în loc                                                                                                                                                                                                                        |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tu**         | Producția pe `release/prod`       | Ce mai cere **domeniul real**: pagina publică din E20 S2 și E04 S4 (proba de restaurare). Stage rulează, deci verificarea lui E18 S4, migrarea din S5, E14 S3b și scheduler-ul din E17 se pot face azi, pe `stage.itbridgeschool.com` |
| **Tu**         | Datele anului școlar din ordin    | Nimic. Ecranul E12 S2 există; intervalele se tastează în `/admin/calendar` o dată pe an                                                                                                                                               |
| **Școala**     | Programa și calendarul vacanțelor | E19 S4. **Nu mai blochează facturarea** — prețul e pe ședință, numărate lunar                                                                                                                                                         |
| **Cine scrie** | Conținutul paginilor              | E19 S6                                                                                                                                                                                                                                |

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
(E16 S5). Ce rămâne nedependent de deploy e restul lui E16, care așteaptă verificarea abonamentului
din S0. **E17 nu mai are story-uri deschise:** S7 și S8 sunt livrate, iar S6 a fost construit și
scos prin decizie.

E11 e închis. Ce a rămas parțial din el — cerințele prealabile de modul la S6, disponibilitatea
profesorilor la S7 — depinde de E10 și E09, nu de E11.

**După tăietura de scop din 6 septembrie, tot ce mai stă între azi și un MVP folosibil încape în
trei rânduri:**

1. **Platforma pe `release/prod`** — restul lui E01 S4. Deploy-ul există și merge, pe stage; ce
   lipsește e decizia și munca de a duce platforma pe branch-ul de producție, fiindcă acolo stă încă
   API-ul de dinainte de E08. Verificările care aveau nevoie doar de „undeva unde rulează" se pot
   face de acum pe stage.
2. **SmartBill** — E16, începând cu verificarea abonamentului din S0. Până la ea nu se scrie cod, iar
   după ea se închid S2, S3, S6 și S8, plus S7 din E15, fiindcă PDF-ul nu se mai generează local.
3. **Termenii, E22 S2** — condiția de ieșire, și singura care nu se poate cumpăra cu timp de
   programare: fără ei nu se deschide accesul familiilor.

Restul deschis e polish cu proprietar clar: SPF/DKIM/DMARC din E17 S1 și conținutul de la E19 S6.
**E18 S5b s-a închis** — bara de filtre și grila de carduri erau ultimele două, iar grila s-a
dovedit un singur card desenat de opt ori. Niciunul nu blochează pe altcineva.

### E22 · Termeni, confidențialitate și ciclul de viață al datelor — `în lucru`

- ~~S1 · Inventarul a ce se stochează~~ — **mutat la E07 S1.** Era același tabel scris de două ori; cel care ajunge sub ochii unei familii ar fi fost tocmai cel rămas în urmă
- [~] S2 · Termenii contului și nota de confidențialitate — **condiția de ieșire a platformei**: fără ei nu se deschide accesul familiilor. Absoarbe și textele de vizitator — confidențialitate, cookie-uri — din fostul E07 S5. **Ciornă 0.1 în `docs/legal/`**: cele trei texte plus README-ul cu sursa fiecărui fapt; scrise din entități și verificate clauză cu clauză contra legii (tabelul e în README); neverificate de avocat, cu faptele lipsă și deciziile propuse marcate `[[…]]`. **Pagini pe stage**: `/termeni`, `/confidentialitate`, `/cookies`, randate din aceleași fișiere
- [ ] S3 · Termenul de păstrare, și ștergerea care chiar șterge — perechea ștergerii logice din E04 S5; numărul se scrie aici, îl execută E07 S4
- [~] S4 · Evidența acceptărilor — **prima jumătate**: bifa la înregistrare (`acceptedTerms`, refuzată fără), un rând per document în `document_acceptances` cu versiunea, spec care ține constanta egală cu capul fișierului. Rămâne re-acceptarea la versiune nouă și a doua bifă pentru clauzele neuzuale

> Ultimul prin decizie: termenii descriu ce face platforma, deci se scriu după ce platforma nu-și
> mai schimbă forma. Scris prea devreme, un asemenea document e o minciună întreținută.

---

Când se schimbă starea unui story, se schimbă întâi în epicul lui și abia apoi aici — altfel fișierul
ăsta devine a doua sursă de adevăr, adică exact lucrul pe care restul documentației îl evită.

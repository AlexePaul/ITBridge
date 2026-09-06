# Tracker

Starea fiecărui story, la zi. Sursa e antetul și notele de livrare din fiecare epic; aici sunt doar
adunate într-un loc.

**Ultima actualizare:** 6 septembrie 2026, pe `release/stage`. Peste starea de cod adusă de E18 S4
vine, în aceeași zi, o **tăietură de scop**: E06 și E13 ies din MVP, la fel E14 S6, E21 S3 și E21 S6;
E15 S1, S2 și S3 se scot, fiind scrise pe modelul pe modul, ca S8; E21 S5 se dovedește livrat de
E20 S4; E22 S1 se mută la E07 S1. Codul din spate e neschimbat — E18 S4
peste E18 S7 și E20 S1–S4, care veneau peste E17 S8, jumătatea din CI a lui E18 S6, E17 S7, E21 S1,
E16 S5, E12 S7, E21 S2/S4 și E12 S5.

## Legendă

- `[x]` livrat
- `[~]` livrat parțial — scrie ce lipsește
- `[r]` scris și verificat, dar într-un PR nemergeat
- `[!]` blocat de altcineva sau de altceva — scrie de cine
- `[ ]` neînceput
- ~~tăiat~~ scos din scop prin decizie

Din **146 de story-uri** în 22 de epicuri: 72 livrate, 18 parțiale, 6 blocate, 12 scoase din scop,
38 neîncepute — a se citi cu legenda de mai sus, fiindcă „parțial" înseamnă adesea „construit, dar
nu rulează nicăieri". (Cifrele sunt numărate din rândurile de mai jos. Cele dinainte erau ținute de
mână și o luaseră razna cu câte unul în patru categorii din cinci.)

Cele 38 neîncepute se citesc și ele cu grijă: **19 dintre ele stau în epicuri scoase din MVP** — E06,
E09, E10 și E13 — deci nu sunt lucru amânat de pe o săptămână pe alta, ci lucru scos din val. Ce a
mai rămas de făcut pentru MVP e în [Ce urmează](#ce-urmează).

---

## Fundație

### E01 · Infrastructură și medii de rulare — `în lucru`

- [x] S1 · Revocarea cheii scurse
- [x] S2 · Ștergerea infrastructurii moarte
- [x] S3 · Docker doar pentru infrastructură
- [!] S4 · Producție pe VPS cu PM2 — **nu există instanța EC2.** Ăsta e blocajul central al hărții
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
- [x] S3 · Seed pentru dezvoltare
- [!] S4 · Backup și restaurare — așteaptă instanța. **Forma e decisă:** `pg_dump` zilnic în același bucket S3, retenție de 30 de zile pe o regulă de lifecycle, o linie de cron pe instanță. Proba de restaurare, cu durata măsurată, rămâne condiția de închidere
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
> discul umplut de loguri, iar rotația se pune odată cu procesul, în E01 S4, ca linie de configurare.
> Consecința de ținut minte: alertarea din E14 S2 rămâne fără canal, iar o excepție în producție se
> află de la părintele care sună.

### E07 · Securitate, GDPR și consimțământ — `propus`

- [ ] S1 · Inventar și clasificare — **singurul inventar**; E22 S2 îl citește, nu îl reface
- [ ] S2 · Consimțământ parental — granularitate `(părinte, copil, scop)`, decisă
- [ ] S3 · Audit log
- [ ] S4 · Export și ștergere — termenul pe care îl aplică e scris în E22 S3
- [ ] S5 · Bannerul de cookie-uri și blocarea scripturilor — **numai mecanica**; textele au plecat la E22 S2
- [ ] S6 · Managementul secretelor
- [ ] S7 · Contracte de prelucrare
- [ ] S8 · Evidența contractului de înscriere — contractul se semnează fizic; platforma reține doar că există

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
- [x] S2 · Contul de părinte: date complete, email confirmat, aprobat de admin — cele două porți, ecranul de aprobări, și blocarea înscrierii cât timp contul nu e activ
- [x] S3 · Capacitate și listă de așteptare — aplicată, probele numărate ca locuri; lista oferă automat locul eliberat. **Fără măturarea ofertelor expirate**, și fără jurnalul de audit al excepției (E06)
- [x] S4 · Lecție de probă — ocupă un loc, apare distinct în catalog, se confirmă sau se închide. **Facturarea numără acum doar înscrierile active**, deci nici proba, nici un copil fără grupă
- [x] S5 · Transferuri — o singură tranzacție, starea și contractul trec mai departe. Efectul pe factură nu se afișează fiindcă prețul e per ședință și pe familie, nu pe grupă
- [~] S6 · Verificări de compatibilitate — vârsta, ca avertisment care cere confirmare. **Acceptat ca stare finală pentru MVP**; cerințele prealabile de modul aparțin lui E10, scos din MVP
- [~] S7 · Formarea grupelor — cererea neacoperită pe vârstă și locație, plus probele fără decizie. **Fără disponibilitatea profesorilor** (E09)

### E12 · Prezență, recuperări și orar — `în lucru`

- [x] S1 · Ședința ca entitate — livrat **redus**: fără modul și lecție, fiindcă E10 nu se face
- [x] S2 · Calendar de vacanțe — livrat: `NonTeachingPeriod`, ecranul `/admin/calendar` cu previzualizarea a ce se anulează, iar generatorul sare peste zilele închise, pe locație
- [x] S3 · Absențe anunțate — `AbsenceNotice` pe ședință, `/user/absente` pentru părinte, insigna și motivul în catalogul de pe telefon. Termenul: **înainte să înceapă ora**, iar `inTime` se îngheață la scriere
- [x] S4 · Recuperări — `MakeUpCredit` câștigat din anunț-în-termen plus absență reală, 30 de zile valabilitate, programare din portal, consumat de marcaj. Compatibilitatea e banda de vârstă, fiindcă modulele din E10 nu există
- [x] S5 · Anulări și mutări — ecranul `/admin/orar` (mută, anulează, reactivează), plus mesajul către familiile grupei la fiecare dintre cele trei, scris în aceeași tranzacție. Recuperarea la anulare e o **bifă**, nu un automatism: ora anulată nu se facturează oricum, deci creditul e o decizie de preț, luată per anulare. Rămâne dispecerul, care pornește la E01 S4
- [~] S6 · Marcarea prezenței pe telefon — livrat fără poze (`Child` n-are câmp, e o decizie E07/E14): `/admin/attendance/azi`, salvare la fiecare apăsare, coadă locală pe rețea picată, buton „Sună părintele" la absență
- [~] S7 · Notificări — **mementoul de la minutul 15** (`@Interval` la 5 minute, fereastra se închide când se termină ora, o alertă per ședință) plus cel zilnic de la 10:00, amândouă către birou; și cele două către părinte, **amândouă despre recuperare**: câștigată (aceeași seară) și care expiră (7 zile înainte). Mesajul de absență a fost scos prin decizie — catalogul uitat/târziu/greșit îl făcea nesigur când era inofensiv și alarmant când nu. A doua linie către părinte nu mai e o datorie deschisă: aștepta rezumatele din E17 S6, iar acelea au fost construite și scoase prin decizie

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
- [x] S5 · Galeria din portal — scrisă și testată; nu se poate arăta nimănui până la E01 S4
- ~~S6 · Vitrina publică~~ — **scos din MVP:** două-trei lucrări puse de mână în paginile publice, ca orice alt conținut, fără backend și fără `isPublic`. Vitrina automată cerea oricum consimțământul din E07 S2; regula „se publică lucrarea, nu copilul" rămâne, iar acordul se cere înainte, chiar dacă la telefon
- [x] S7 · Corectarea unei atribuiri greșite — urma stă pe `Project`, nu în audit log-ul din E07 S3

> Complet specificat, gata de construit. Fluxul e: agent local pe calculatorul cu share-ul de rețea,
> profesorul salvează în folderul copilului, adminul revizuiește pe grupă și apasă trimite.

---

## Bani

### E15 · Pricing și facturare v2 — `în lucru; S1–S3 scoase`

- [x] S0 · Prețul pe ședință și ecranul de emitere — 87,50/62,50 per ședință, arbore familie→copii, zero se consemnează ca `waived`. **Facturarea pe modul a fost analizată și abandonată**, vezi caseta din epic
- ~~S1 · Catalogul de prețuri~~ — **scos:** cheia lui e modulul din E10, iar textul interzice explicit coloana de preț pe ședință, care e azi tot modelul. Dacă tarifele trebuie vreodată scoase din cod, e un story nou, pe ședință
- ~~S2 · Factura pe modul, cu linii~~ — **scos:** `Billing` există doar fiindcă S3 rupea o notă de plată în două facturi. Liniile de factură rămân o idee bună și n-au legătură cu modulele — story nou, când se face
- ~~S3 · Planuri de plată~~ — **scos:** factura lunară e deja plata în tranșe; nu mai există suma de 700 pe modul care să se rupă în două
- [x] S4 · Regula pentru mai mulți copii — 350 + 250 pe frate, într-un singur loc; ambele bug-uri reparate. Din E11/S4, suma numără doar copiii înscriși activ
- [~] S5 · Reduceri cu tip — **tipul livrat** (`fixed`/`percent`, plafon 100%, ecranul `/admin/reduceri`); scopul, condițiile și valabilitatea nu s-au construit, fiindcă n-au niciun client
- [ ] S6 · Previzualizare și emitere în masă
- [ ] S7 · PDF-ul nu se mai generează local
- [x] S8 · Înscrierea la mijlocul unui modul — **rezolvat de modelul pe ședință**, nu de cod: cine intră pe 15 are mai puține ședințe în lună. Livrat aici: ecranul de emitere sortează familiile pe grupe, cum se și numără

> **Bug-uri în modelul folosit azi**, în `apps/api/src/modules/invoice/invoice.service.ts`:
> la doi copii calculează 500 în loc de 600; la trei sau mai mulți nu există ramură, deci factura
> iese 0 lei, iar reducerile o duc pe negativ. Două teste `it.failing` le documentează.

### E16 · Încasări și facturare prin SmartBill — `în lucru`

- [ ] S0 · Verificarea premisei — abonamentul Facturare Platinum, înainte de orice cod
- [x] S1 · Modelul de plată refăcut — sumă, metodă închisă, stare, referință de extras, cine a înregistrat-o; mulți-la-unu cu factura, starea facturii derivată din plățile reușite. **Fără câmpurile SmartBill de pe factură** — alea așteaptă S0
- [ ] S2 · Emiterea prin SmartBill
- [ ] S3 · Emiterea în masă, temperată — 3 apeluri pe secundă
- ~~S4 · Plata cu cardul în portal~~ — amânată; se încasează prin transfer sau numerar
- [~] S5 · Încasările: numerar și transfer bancar — **jumătatea de ecran**: încasarea se începe din rândul de restanță, precompletată cu restul de plată, iar `/admin/payments/new` e lista facturilor care mai au ceva de plată, nu un formular gol. Propagarea în SmartBill așteaptă S0
- [ ] S6 · Chitanțe și confirmări
- [x] S7 · Restanțe — ecranul `/admin/restante` cu vechime, job zilnic care marchează și scrie (3 zile înainte, apoi săptămânal, tăcere după 60), termen de 14 zile derivat din data emiterii. Fără grupare pe locație: o familie poate avea copii la ambele adrese
- [ ] S8 · Reconciliere și verificare

---

## Comunicare

### E17 · Comunicare și notificări — `livrat cât se poate fără deploy`

- [~] S1 · Furnizorul și livrabilitatea — parțial: `MailService` există în `apps/api`; SPF/DKIM/DMARC și partea de operare, nu
- [x] S2 · Șabloane — implicitele în cod, editările în `mail_templates`; ecranul `/admin/emailuri` cu previzualizare pe draft; mesajele de cont din E11 S2 mutate pe `render()`, cu variantă HTML
- [~] S3 · Coadă și reîncercare — parțial: outbox-ul e întreg, dar **nu rulează nicăieri** până la deploy. Prin el trece deja tot ce trimite backend-ul: mementourile de prezență și de recuperare din E12, restanțele din E16, mesajele de cont și locul eliberat din E11, proiectele din E14
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
- [~] S4 · Portalul părintelui — **rescris pe sistemul din S1**: shell propriu (`layouts/portal.vue` — navbar plus rând de taburi, nu bara laterală de admin), Acasă / Absențe / Proiecte / Plăți / Profil, cele trei ecrane de intrare în cont, și comutatorul de copil, care se păstrează între pagini și în URL. Rămâne verificarea pe date reale și pe telefon, care cere deploy-ul din E01 S4
- [~] S5 · Uniformizarea zonei de admin — **componentele livrate** (`AdminPage`, triada de stări, `AdminTable`, `AdminListRow`, `AdminFormActions`, `AdminConfirmModal`), iar **S5b a început: 26 din 42 de ecrane sunt pe ele** (erau 12 din 44). Prima trecere a luat ecranele care ascundeau un defect: `GroupCard` numără locurile de la server, nu din lista de copii, care n-are probe în ea (D7); patru `<select>` native și zece `console.log` cu date de familii au dispărut; iar al doilea drum de emitere (`invoices/new`, rămas și pe `UFormGroup` din @nuxt/ui v2, plus `invoices/preview/:month`) a fost **șters**, fiindcă emitea o lună pe numere pe care nu se uitase nimeni. Rămân 16 ecrane, plus `AdminDateField`, bara de filtre și grila de carduri
- [~] S6 · Accesibilitate — **verificarea automată rulează în CI**: axe-core într-un Chromium adevărat, pe fiecare pagină din sitemap, în ambele teme, pe WCAG 2.0 și 2.1 A+AA. Rămâne zona autentificată, care se verifică odată cu S4 și S5
- [x] S7 · Interfața profesorului — fără rol separat, e o vedere din zona de admin, nu o zonă a ei. Măsurat la 390px: **meniul era acoperit de filtrul de locație** (10px din 44 apăsabili), accentul lui Nuxt UI rămăsese la 2,61:1 de partea autentificată, iconițele veneau de la Iconify la rulare, iar coada aștepta un `online` care nu vine pe conexiunea din sală

### E19 · SEO, GEO și conținut — `în lucru`

- [x] S1 · Fundația tehnică
- [x] S2 · Date structurate
- [x] S3 · Pagini locale — livrat pe site, **iar cele două profiluri Google Business sunt create**, unul per adresă
- [!] S4 · Pagini de modul — așteaptă E10, care e scos din MVP
- [~] S5 · Performanță — livrat odată cu E18 S2; rămâne confirmarea pe trafic real, care cere domeniul live
- [!] S6 · Conținut — blocat de „cine scrie textele"
- [x] S7 · Pregătire pentru motoare generative
- [~] S8 · Măsurare — **Search Console e configurat pe ambele proprietăți**, cu linia de bază consemnată în epic. Analiza de trafic așteaptă consimțământul din E07 S2, nu domeniul

> Lucrul cel mai valoros rămas aici nu e cod. Pentru căutările locale, cele două profiluri Google
> Business contează mai mult decât orice a rămas de scris în repo.

### E20 · Achiziție, lecții de probă și lead management — `în lucru`

- [x] S1 · Modelul de lead — `Lead` cu sursă, canal declarat, responsabil și dată de urmărire. **Patru din cele șase stări nu se scriu de la niciun ecran**: vin din programare, din catalog și din rezolvarea probei în E11, iar `UpdateLeadDto` n-are câmp `status`
- [~] S2 · Programare la lecție de probă — `/proba` plus `GET /trial/slots` și `POST /trial/bookings`, **singurele rute publice în afară de autentificare**. Fără cont, dar cu loc real: scrie profil-coajă, copil și înscriere `TRIAL` prin `EnrollmentService`, într-o tranzacție. Grupa plină nu se oferă, iar locul luat între timp nu dă eroare, ci un lead. **Rămâne** doar aducerea paginii pe `release/prod`, care cere backend deployat (E01 S4)
- [x] S3 · Urmărire — `/admin/leads` în ordinea a cât costă pierderea unei familii, plus mesajul zilnic de la 09:00, mementoul cu o zi înainte de probă și recontactarea după neprezentare. „Probă ținută" o pune catalogul, nu o bifă; nicio cerere nu iese fără motiv scris
- [x] S4 · Măsurarea pâlniei — fila „Pâlnia" din `/admin/rapoarte`. Cohortă după data cererii, trecere nu ocupare, mediana până la decizie lângă conversia probă→înscriere, și cererile fără loc numărate separat, fiindcă nu intră în nicio rată
- [x] S5 · Recomandări — **redus prin decizie și livrat astfel**: 50% de fiecare parte, date de mână din `/admin/reduceri`. Fără cod, fără link, fără atribuire automată — deci nici măsurare a canalului

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
- [ ] S7 · Semnale timpurii

---

## Ce așteaptă pe cineva

Niciun blocaj nu e de cod. În ordinea a cât deblochează:

| Cine           | Ce                                | Ce ține în loc                                                                                                                                                             |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tu**         | Instanța EC2                      | E01 S4, **verificarea lui E18 S4 și migrarea din S5**, E04 S4, E14 S3b, scheduler-ul din E17 și pagina publică din E20 S2. Șapte story-uri din cinci epicuri — E14 S6 a ieșit din listă odată cu MVP-ul |
| **Tu**         | Datele anului școlar din ordin    | Nimic. Ecranul E12 S2 există; intervalele se tastează în `/admin/calendar` o dată pe an                                                                                    |
| **Școala**     | Programa și calendarul vacanțelor | E19 S4. **Nu mai blochează facturarea** — prețul e pe ședință, numărate lunar                                                                                              |
| **Cine scrie** | Conținutul paginilor              | E19 S6                                                                                                                                                                     |

## Ce urmează

**Cu instanța EC2:** E01 S4, deploy-ul. În ziua în care merge, portalul părintelui, prezența și
facturile devin lucruri pe care le poate folosi cineva.

**Fără ea:** jumătatea de componente din E18 S5 e făcută, iar bucla banilor e închisă cât se poate
fără SmartBill — se emite (E15 S0), se vede cine n-a plătit (E16 S7) și se încasează de acolo
(E16 S5). Ce rămâne nedependent de deploy e restul lui E16, care așteaptă verificarea abonamentului
din S0. **E17 nu mai are story-uri deschise:** S7 și S8 sunt livrate, iar S6 a fost construit și
scos prin decizie.

E11 e închis. Ce a rămas parțial din el — cerințele prealabile de modul la S6, disponibilitatea
profesorilor la S7 — depinde de E10 și E09, nu de E11.

**După tăietura de scop din 6 septembrie, tot ce mai stă între azi și un MVP folosibil încape în
trei rânduri:**

1. **Instanța EC2 și deploy-ul** — E01 S4, cu cele șapte story-uri care atârnă de el, din tabelul de
   mai sus. Niciunul nu e muncă de gândit; e muncă de pornit.
2. **SmartBill** — E16, începând cu verificarea abonamentului din S0. Până la ea nu se scrie cod, iar
   după ea se închid S2, S3, S6 și S8, plus S7 din E15, fiindcă PDF-ul nu se mai generează local.
3. **Termenii, E22 S2** — condiția de ieșire, și singura care nu se poate cumpăra cu timp de
   programare: fără ei nu se deschide accesul familiilor.

Restul deschis e polish cu proprietar clar: migrarea ecranelor rămase din E18 S5b, verificarea de
accesibilitate a zonei autentificate din E18 S6, SPF/DKIM/DMARC din E17 S1, conținutul de la E19 S6.
Niciunul nu blochează pe altcineva.

### E22 · Termeni, confidențialitate și ciclul de viață al datelor — `propus`

- ~~S1 · Inventarul a ce se stochează~~ — **mutat la E07 S1.** Era același tabel scris de două ori; cel care ajunge sub ochii unei familii ar fi fost tocmai cel rămas în urmă
- [ ] S2 · Termenii contului și nota de confidențialitate — **condiția de ieșire a platformei**: fără ei nu se deschide accesul familiilor. Absoarbe și textele de vizitator — confidențialitate, cookie-uri — din fostul E07 S5
- [ ] S3 · Termenul de păstrare, și ștergerea care chiar șterge — perechea ștergerii logice din E04 S5; numărul se scrie aici, îl execută E07 S4
- [ ] S4 · Evidența acceptărilor, versionată

> Ultimul prin decizie: termenii descriu ce face platforma, deci se scriu după ce platforma nu-și
> mai schimbă forma. Scris prea devreme, un asemenea document e o minciună întreținută.

---

Când se schimbă starea unui story, se schimbă întâi în epicul lui și abia apoi aici — altfel fișierul
ăsta devine a doua sursă de adevăr, adică exact lucrul pe care restul documentației îl evită.

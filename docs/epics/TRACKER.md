# Tracker

Starea fiecărui story, la zi. Sursa e antetul și notele de livrare din fiecare epic; aici sunt doar
adunate într-un loc.

**Ultima actualizare:** 31 august 2026, pe `develop`, cu E14 mergeat.

## Legendă

- `[x]` livrat
- `[~]` livrat parțial — scrie ce lipsește
- `[r]` scris și verificat, dar într-un PR nemergeat
- `[!]` blocat de altcineva sau de altceva — scrie de cine
- `[ ]` neînceput
- ~~tăiat~~ scos din scop prin decizie

Din **142 de story-uri** în 21 de epicuri: 57 livrate, 15 parțiale, 7 blocate, 4 scoase din scop,
59 neîncepute — a se citi cu legenda de mai sus, fiindcă „parțial" înseamnă adesea „construit, dar
nu rulează nicăieri".

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

> O rezervă: branch protection pe `main` se activează din Settings, nu din repo.

### E04 · Migrări și integritatea datelor — `în lucru`

- [x] S1 · Migrarea de bază
- [~] S2 · Migrările în deploy — comenzile și garda de CI există; cablarea în deploy nu, fiindcă nu există deploy
- [x] S3 · Seed pentru dezvoltare
- [!] S4 · Backup și restaurare — așteaptă instanța
- [ ] S5 · Retenție — **nu mai așteaptă contabilul**: documentul fiscal stă în SmartBill, noi ținem doar evidența. Rămâne politica pentru prezențe, proiecte și conturi inactive

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

### E06 · Observabilitate și operare — `propus`

- [ ] S1 · Raportare de erori
- [ ] S2 · Loguri agregate
- [ ] S3 · Uptime și alertare
- [ ] S4 · Metrici
- [ ] S5 · Runbook
- [ ] S6 · Bugete de performanță

### E07 · Securitate, GDPR și consimțământ — `propus`

- [ ] S1 · Inventar și clasificare
- [ ] S2 · Consimțământ parental — granularitate `(părinte, copil, scop)`, decisă
- [ ] S3 · Audit log
- [ ] S4 · Export și ștergere
- [ ] S5 · Documente legale
- [ ] S6 · Managementul secretelor
- [ ] S7 · Contracte de prelucrare
- [ ] S8 · Evidența contractului de înscriere — contractul se semnează fizic; platforma reține doar că există

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
- [ ] S4 · Recuperări
- [~] S5 · Anulări și mutări — anularea, reactivarea și acum **mutarea** (`PUT /class-sessions/:id/move`, cu calendarul școlar respectat și sala verificată de ciocniri); fără ecran, fără notificare
- [~] S6 · Marcarea prezenței pe telefon — livrat fără poze (`Child` n-are câmp, e o decizie E07/E14): `/admin/attendance/azi`, salvare la fiecare apăsare, coadă locală pe rețea picată, buton „Sună părintele" la absență
- [~] S7 · Notificări — livrat **altceva decât cere story-ul**: mementoul zilnic de la 10:00 către școală, cerut explicit. Notificările către părinți rămân nelivrate

### E13 · Progres, evaluare și feedback — `propus`

- [ ] S1 · Evaluare pe competențe
- [ ] S2 · Observații
- [ ] S3 · Raport de final de modul
- [ ] S4 · Certificat
- [ ] S5 · Progresul în portal

### E14 · Proiectele elevilor — `în lucru`

- [x] S1 · Modelul de proiect — fără instantaneu de consimțământ și fără `isPublic`; vin cu E07 S2
- [x] S2 · Agentul local și folderul oglindit — `apps/agent`, fără dependențe de runtime. Vizibilitatea pulsului da, **alertarea nu**: canalul e E06 S3 și nu există
- [x] S3a · Miniatură pentru imagini
- [!] S3b · Miniaturi pentru video și `.sb3` — cere ffmpeg pe host, deci deploy
- [x] S4 · Trimiterea către părinte — părinții fără adresă apar în raportul trimiterii, nu în evidența din E17 S5, care nu există
- [x] S5 · Galeria din portal — scrisă și testată; nu se poate arăta nimănui până la E01 S4
- [!] S6 · Vitrina publică — cere backend deployat **și** consimțământul din E07 S2
- [x] S7 · Corectarea unei atribuiri greșite — urma stă pe `Project`, nu în audit log-ul din E07 S3

> Complet specificat, gata de construit. Fluxul e: agent local pe calculatorul cu share-ul de rețea,
> profesorul salvează în folderul copilului, adminul revizuiește pe grupă și apasă trimite.

---

## Bani

### E15 · Pricing și facturare v2 — `în lucru`

- [x] S0 · Prețul pe ședință și ecranul de emitere — 87,50/62,50 per ședință, arbore familie→copii, zero se consemnează ca `waived`. **Facturarea pe modul a fost analizată și abandonată**, vezi caseta din epic
- [ ] S1 · Catalogul de prețuri
- [ ] S2 · Factura pe modul, cu linii
- [ ] S3 · Planuri de plată
- [x] S4 · Regula pentru mai mulți copii — 350 + 250 pe frate, într-un singur loc; ambele bug-uri reparate. Din E11/S4, suma numără doar copiii înscriși activ
- [~] S5 · Reduceri cu tip — **tipul livrat** (`fixed`/`percent`, plafon 100%, ecranul `/admin/reduceri`); scopul, condițiile și valabilitatea nu s-au construit, fiindcă n-au niciun client
- [ ] S6 · Previzualizare și emitere în masă
- [ ] S7 · PDF-ul nu se mai generează local
- [ ] S8 · Înscrierea la mijlocul unui modul — pro-rata pe ședințele rămase

> **Bug-uri în modelul folosit azi**, în `apps/api/src/modules/invoice/invoice.service.ts`:
> la doi copii calculează 500 în loc de 600; la trei sau mai mulți nu există ramură, deci factura
> iese 0 lei, iar reducerile o duc pe negativ. Două teste `it.failing` le documentează.

### E16 · Încasări și facturare prin SmartBill — `în lucru`

- [ ] S0 · Verificarea premisei — abonamentul Facturare Platinum, înainte de orice cod
- [x] S1 · Modelul de plată refăcut — sumă, metodă închisă, stare, referință de extras, cine a înregistrat-o; mulți-la-unu cu factura, starea facturii derivată din plățile reușite. **Fără câmpurile SmartBill de pe factură** — alea așteaptă S0
- [ ] S2 · Emiterea prin SmartBill
- [ ] S3 · Emiterea în masă, temperată — 3 apeluri pe secundă
- ~~S4 · Plata cu cardul în portal~~ — amânată; se încasează prin transfer sau numerar
- [ ] S5 · Încasările: numerar și transfer bancar
- [ ] S6 · Chitanțe și confirmări
- [ ] S7 · Restanțe
- [ ] S8 · Reconciliere și verificare

---

## Comunicare

### E17 · Comunicare și notificări — în PR #27

- [~] S1 · Furnizorul și livrabilitatea — parțial: `MailService` există în `apps/api`; SPF/DKIM/DMARC și partea de operare, nu
- [x] S2 · Șabloane — implicitele în cod, editările în `mail_templates`; ecranul `/admin/emailuri` cu previzualizare pe draft; mesajele de cont din E11 S2 mutate pe `render()`, cu variantă HTML
- [~] S3 · Coadă și reîncercare — parțial: outbox-ul e întreg, dar **nu rulează nicăieri** până la deploy. Îl folosesc acum patru apelanți: mementoul zilnic din E12 și cele trei mesaje de cont din E11 S2
- [ ] S4 · Preferințe și dezabonare
- [ ] S5 · Evidența livrărilor
- [ ] S6 · Rezumate în loc de rafale
- [ ] S7 · Anunțuri
- [ ] S8 · Trimitere declanșată de admin

> WhatsApp a ieșit din MVP prin decizie. Emailul e singurul canal.

---

## Public

### E18 · Frontend: design system și portal — `în lucru`

- [x] S1 · Fundația de design
- [x] S2 · Pipeline de imagini — `@nuxt/image`, WebP cu rezervă JPEG, `srcset` pe lățimile reale: **1056KB → 239KB**. AVIF măsurat și respins
- [x] S3 · Paginile publice
- [!] S4 · Portalul părintelui — **cerut explicit de școală: rescriere, nu retuș.** Blocat de deploy: paginile de după autentificare nu se pot nici testa, nici arăta
- [~] S5 · Uniformizarea zonei de admin — **jumătatea de componente livrată**: `AdminPage`, triada de stări, `AdminTable`, `AdminListRow`, `AdminFormActions`, `AdminConfirmModal`, pe un catalog al celor 7 dialecte de tabel și 5 de formular; `/admin/calendar` migrat ca dovadă. Migrarea celor 32 de ecrane (S5b) rămâne blocată de deploy
- [~] S6 · Accesibilitate — verificarea în CI lipsește
- [ ] S7 · Interfața profesorului — fără rol separat, e o vedere din zona de admin, nu o zonă a ei

### E19 · SEO, GEO și conținut — `în lucru`

- [x] S1 · Fundația tehnică
- [x] S2 · Date structurate
- [~] S3 · Pagini locale — livrat pe site; **rămâne partea din afara lui: două profiluri Google Business verificate, unul per adresă**
- [!] S4 · Pagini de modul — așteaptă E10, care e scos din MVP
- [~] S5 · Performanță — livrat odată cu E18 S2; rămâne confirmarea pe trafic real, care cere domeniul live
- [!] S6 · Conținut — blocat de „cine scrie textele"
- [x] S7 · Pregătire pentru motoare generative
- [~] S8 · Măsurare — **Search Console e configurat pe ambele proprietăți**, cu linia de bază consemnată în epic. Analiza de trafic așteaptă consimțământul din E07 S2, nu domeniul

> Lucrul cel mai valoros rămas aici nu e cod. Pentru căutările locale, cele două profiluri Google
> Business contează mai mult decât orice a rămas de scris în repo.

### E20 · Achiziție, lecții de probă și lead management — `propus`

- [ ] S1 · Modelul de lead
- [ ] S2 · Programare la lecție de probă
- [ ] S3 · Urmărire
- [ ] S4 · Măsurarea pâlniei
- [x] S5 · Recomandări — **redus prin decizie și livrat astfel**: 50% de fiecare parte, date de mână din `/admin/reduceri`. Fără cod, fără link, fără atribuire automată — deci nici măsurare a canalului

> Formularul de contact rămâne pe email, prin decizie: nu scrie lead, nu atinge backend-ul.

---

## Business

### E21 · Raportare și analytics — `propus`

- [ ] S1 · Tablou de bord operațional
- [ ] S2 · Rapoarte financiare
- [ ] S3 · Retenție și abandon
- [ ] S4 · Ocupare
- [ ] S5 · Pâlnia
- [ ] S6 · Export pentru contabil
- [ ] S7 · Semnale timpurii

---

## Ce așteaptă pe cineva

Niciun blocaj nu e de cod. În ordinea a cât deblochează:

| Cine           | Ce                                | Ce ține în loc                                                                                |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| **Tu**         | Instanța EC2                      | E01 S4, **E18 S4 și S5**, E04 S4, E14 S3b și S6, scheduler-ul din E17. Șapte story-uri din patru epicuri |
| **Tu**         | Datele anului școlar din ordin    | Nimic. Ecranul E12 S2 există; intervalele se tastează în `/admin/calendar` o dată pe an       |
| **Tu**         | Două profiluri Google Business    | E19 S3, partea din afara site-ului                                                            |
| **Tu**         | Ștergerea recordului `api.` din DNS | Nimic — dar e un record orfan către un IP EC2 străin. Vezi riscul din E01                    |
| **Școala**     | Programa și calendarul vacanțelor | E19 S4. **Nu mai blochează facturarea** — prețul e pe ședință, numărate lunar                 |
| **Cine scrie** | Conținutul paginilor              | E19 S6                                                                                        |

## Ce urmează

**Cu instanța EC2:** E01 S4, deploy-ul. În ziua în care merge, portalul părintelui, prezența și
facturile devin lucruri pe care le poate folosi cineva.

**Fără ea:** jumătatea de componente din E18 S5 e făcută; ce rămâne nedependent de deploy e în
E12 (S3, S6), E16 (S5, S7 pe modelul nou de plată) și E17 (S2, S5).

E11 e închis. Ce a rămas parțial din el — cerințele prealabile de modul la S6, disponibilitatea
profesorilor la S7 — depinde de E10 și E09, nu de E11.

---

Când se schimbă starea unui story, se schimbă întâi în epicul lui și abia apoi aici — altfel fișierul
ăsta devine a doua sursă de adevăr, adică exact lucrul pe care restul documentației îl evită.

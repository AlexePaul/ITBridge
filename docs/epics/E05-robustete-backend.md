# E05 · Robustețe backend

**Status:** livrat · **Pistă:** Fundație · **Depinde de:** E03, E04 · **Blochează:** E06, E07, E17

## Problemă

Backend-ul "se simte shaky", și există un motiv precis, verificabil.

**Validarea nu rulează.** 22 de fișiere DTO au decoratori `class-validator` — `@IsEmail`,
`@MinLength(6)`, `@IsPhoneNumber`. Niciun `ValidationPipe` nu e înregistrat în `apps/api/src/main.ts`, și nu
există `APP_PIPE` nicăieri. O căutare în tot `src/` după `ValidationPipe`, `useGlobalPipes` sau
`APP_PIPE` nu returnează nimic. **Toți decoratorii sunt decorativi.** Body-uri brute ajung direct
în servicii și de acolo în TypeORM. `RegisterDto` cere parolă de minim șase caractere; astăzi
merge și una goală.

Restul, din aceeași categorie:

- **Fără exception filter.** Erorile ies în forme diferite după cum le produce Nest, TypeORM sau
  un `throw` din service. Frontend-ul nu are un contract de eroare pe care să se bazeze.
- **Fără logging structurat.** `console.log` în plugin-ul de auth din frontend, nimic pe backend.
  Când ceva cade în producție, nu ai ce citi.
- **Fără `/health`.** Nici pentru PM2, nici pentru un uptime checker.
- **Fără rate limiting.** `/auth/login` acceptă oricâte încercări.
- **Secrete cu fallback tăcut.** `apps/api/src/constants/jwtConstants.ts` cade pe `'defaultAccessSecret'` și
  `'defaultRefreshSecret'` dacă variabilele lipsesc. O producție pornită fără ele semnează tokenuri
  cu un secret public, și nimic nu avertizează.
- **Refresh tokens nerevocabile.** Sunt stateless. Nu există logout server-side, nici listă de
  revocare. Un token furat e valid șapte zile, indiferent ce faci.
- **CORS hardcodat** în `apps/api/src/main.ts` pe `https://itbridgeschool.com` și `http://localhost:3001`.
- **Configurație împrăștiată.** `process.env` citit direct în `apps/api/src/app.module.ts` și în constante,
  fără `ConfigModule`, fără validare la pornire.

## Rezultat

O cerere invalidă e respinsă la graniță, cu un mesaj util. O eroare are aceeași formă indiferent
de unde vine. Aplicația refuză să pornească dacă e configurată greșit. Un incident lasă urme
citibile.

## În scop

- `ValidationPipe` global și auditarea DTO-urilor.
- Exception filter global cu formă unică de eroare.
- `ConfigModule` cu validare de mediu la pornire.
- Logging structurat cu id de corelare.
- `/health` și `/ready`.
- Rate limiting pe rutele sensibile.
- Rotația și revocarea refresh tokenurilor, plus logout real.
- Audit de autorizare pe fiecare endpoint.
- CORS din configurație.

## În afara scopului

- Monitorizare, alertare, agregare de loguri — vezi [E06](E06-observabilitate-operare.md).
- Roluri noi dincolo de cele două existente — vezi [E09](E09-personal-roluri.md).

## Story-uri

### S1 · ValidationPipe global

Înregistrat cu `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Apoi **fiecare**
DTO e recitit: decoratorii au fost scriși fără să fi fost vreodată executați, deci unii vor fi
greșiți sau prea stricți, iar activarea lor va rupe fluxuri care astăzi merg.

**Acceptanță:** un `POST /auth/register` cu parolă de trei caractere primește 400 cu detalii pe
câmp. Un body cu un câmp în plus e respins. Toate testele de integrare din
[E03](E03-testare-ci.md) trec.

**Livrat.** Pipe-ul e înregistrat ca `APP_PIPE`, nu în `main.ts`, ca să se aplice și aplicațiilor
construite în teste. Un pipe pus doar în `main.ts` ar fi lăsat testele să ruleze pe body-uri
nevalidate — exact mecanismul prin care 22 de fișiere DTO au ajuns cu decoratori care n-au rulat
niciodată.

**Modul permisiv cu logare, recomandat de epic, nu s-a mai justificat.** Sfatul presupune trafic de
producție care s-ar rupe; nu există, aplicația n-a fost deployată niciodată. A fost pornit strict,
iar testele de integrare au spus ce s-a schimbat: **un singur test**, cel care trimitea
`role: 'ADMIN'` în plus. Acum e respins din start, nu ignorat tăcut.

`enableImplicitConversion` e oprit deliberat. Convertește înainte să valideze, deci `@IsString()`
ar accepta numărul 1234 transformându-l în `"1234"`, ceea ce golește de sens majoritatea
decoratorilor de tip. Cele patru DTO-uri care chiar au nevoie de numere din query string o spun
explicit, cu `@Type(() => Number)`.

**Trei defecte de DTO au ieșit la iveală abia fiindcă decoratorii au început să ruleze:**

- `markAttendanceDto` folosea `@ValidateNested({ each: true })` fără `@Type`, deci
  class-transformer lăsa tablourile ca obiecte simple și decoratorii de pe clasa imbricată nu
  rulau deloc. Un `childId` string trecea nestingherit.
- `updateGroupDto` n-avea `@IsOptional()` pe niciun câmp, deci o actualizare parțială ar fi fost
  respinsă pentru câmpurile pe care nu le trimitea.
- `monthIssued` era doar `@IsString()`, în patru DTO-uri, deși coloana e `varchar(7)` și
  `@Unique(['parent', 'monthIssued'])` se cheie pe șirul exact.

Plus `@IsNotEmpty()` pe `parentIds`, care respinge doar `null` — `[]` emitea zero facturi și
raporta succes.

### S2 · Formă unică de eroare

Exception filter global. Fiecare eroare are `statusCode`, `message`, `code`, `requestId`, plus
`details` pe erorile de validare. Erorile TypeORM nu se scurg niciodată către client — o violare de
constrângere unică devine 409 cu mesaj util, nu 500 cu SQL în el.

**Acceptanță:** frontend-ul are un singur loc care interpretează erori. Niciun răspuns de eroare nu
conține nume de tabele sau SQL.

**Livrat.** `statusCode`, `code`, `message`, `requestId`, `path`, `timestamp`, plus `details` pe
erorile de validare. `code` e partea stabilă: frontend-ul comută pe el, niciodată pe `message`.

Erorile de bază de date sunt traduse, nu transmise: o violare de unicitate devine 409, una de cheie
străină 400, restul 500 cu mesaj generic, fiindcă textul driverului numește tabele și coloane.
Verificat cu o constrângere ridicată chiar de Postgres, nu doar cu una prinsă în service.

Răspunsurile 5xx se loghează cu id și stack; cele 4xx nu — sunt problema apelantului și ar fi o cale
ușoară de a inunda logurile.

### S3 · Configurație validată la pornire

`ConfigModule` cu schemă de validare. Aplicația **refuză să pornească** dacă lipsește un secret
JWT, dacă e egal cu valoarea default, sau dacă lipsește configurația de bază de date. Fallback-urile
din `apps/api/src/constants/jwtConstants.ts` dispar.

**Acceptanță:** pornire fără `JWT_ACCESS_TOKEN_SECRET` eșuează cu mesaj explicit, în loc să meargă
mai departe cu `'defaultAccessSecret'`.

**Livrat, cu trei verificări dincolo de prezență:** secrete sub 16 caractere, valorile implicite
publicate în repo, și secrete de access și refresh identice — ultima transformă tăcut un token de
15 minute într-unul de șapte zile, fiindcă fiecare e atunci acceptat în locul celuilalt.

**Fără `@nestjs/config`, pe care epicul îl numește.** Nimic nu injectează un `ConfigService`, deci
modulul ar fi adus o dependență ESM-only pe care jest n-o poate încărca, fără niciun câștig la
rulare. `load-env.ts` e oricum fișierul importat înaintea oricărei citiri din `process.env`, adică
exact locul verificării.

### S4 · Logging structurat

Logger JSON, cu id de corelare pe fiecare cerere, propagat în loguri. Fiecare cerere lasă o linie:
metodă, rută, status, durată, id de utilizator. Fără date personale în loguri — vezi
[E07](E07-securitate-gdpr.md).

**Acceptanță:** un id de corelare dintr-un răspuns de eroare regăsește tot lanțul în loguri.

**Livrat.** O linie JSON per cerere: metodă, rută, status, durată, utilizator, id de corelare —
același id pe care îl poartă răspunsul de eroare și antetul `x-request-id`. Un id trimis de apelant
e păstrat, ca o urmă să supraviețuiască saltului dinspre frontend, dar numai dacă arată a id: altfel
un client ar putea scrie text arbitrar în loguri.

Deliberat **fără** body-uri de cerere sau de răspuns: conțin nume, e-mailuri și parole, iar un log e
cel mai ușor loc în care scapi date personale fără să observi. Valorile cheilor sensibile din query
sunt înlocuite.

### S5 · Health și readiness

`GET /health` răspunde fără să atingă baza de date. `GET /ready` verifică baza de date și S3.
PM2 și uptime checker-ul le folosesc.

**Acceptanță:** `/health` răspunde 200 în sub 50ms. `/ready` întoarce 503 cu Postgres oprit.

**Livrat.** `/health` nu atinge nimic — un probe de liveness care ar interoga baza ar transforma o
bază lentă într-o buclă de repornire. `/ready` verifică baza **și S3** și răspunde 503 fără să spună
de ce: e accesibil fără credențiale.

Ambele verificări au un timeout de două secunde. Fără el, `/ready` distingea „baza e oprită" (refuz
de conexiune, 503 în milisecunde) dar nu și „baza e blocată": cu procesul Postgres suspendat,
endpoint-ul nu răspundea deloc după douăzeci de secunde. Un probe care atârnă e mai rău decât unul
care spune „nu sunt gata", fiindcă un load balancer nu are ce citi din el.

Controllerul poartă `@SkipThrottle()`. Altfel probe-urile consumă din plafonul global de 300/minut,
partajat cu traficul real — iar în spatele unui proxy totul se numără pe aceeași cheie, deci un
liveness check la o secundă își putea provoca singur 429, pe care PM2 îl citește ca proces mort.

### S6 · Rate limiting

Throttler pe `/auth/login`, `/auth/register`, `/auth/refresh`, și pe orice endpoint care trimite
email după [E17](E17-comunicare-notificari.md). Limite pe IP și pe cont.

**Acceptanță:** a unsprezecea încercare de login într-un minut primește 429.

**Livrat parțial.** Zece pe minut la login, cinci la register, douăzeci la refresh, peste un plafon
global mult mai larg, ca navigarea obișnuită să nu fie atinsă. Acceptanța — a unsprezecea încercare
într-un minut primește 429 — e îndeplinită.

**Limitele pe cont nu există.** Story-ul cere „limite pe IP și pe cont"; e implementat doar pe IP.
Un atac distribuit pe un singur cont trece pe sub plafon, fiindcă fiecare adresă rămâne sub zece
încercări. Rămâne de făcut, alături de limitele pe e-mail din [E17](E17-comunicare-notificari.md).

`app.set('trust proxy', 1)` e obligatoriu și e pus în `main.ts`: fără el, în spatele lui Caddy
`req.ip` e adresa proxy-ului pentru toată lumea, iar limita de zece login-uri pe minut devine
globală pe toată școala.

`RATE_LIMIT_ENABLED=false` îl oprește de tot. E o opțiune reală de operare — în spatele unui CDN sau
WAF care limitează deja, un al doilea limitator care numără IP-ul proxy-ului face mai mult rău decât
bine — și e ce folosesc suitele de test, fiindcă zeci de teste care înregistrează utilizatori în
`beforeEach` ar măsura suita, nu comportamentul. Implicit e pornit.

### S7 · Sesiuni revocabile și logout

Refresh tokenurile devin urmăribile: tabel de sesiuni cu id, utilizator, dată de emitere, expirare,
revocare, user agent. Refresh-ul rotește tokenul și îl invalidează pe cel vechi; refolosirea unuia
deja consumat invalidează întregul lanț, ca semnal de furt. `POST /auth/logout` revocă sesiunea.

**Acceptanță:** un logout face refresh tokenul inutilizabil imediat. Un părinte își poate vedea și
încheia sesiunile active.

**Livrat.** Tabel `sessions` în Postgres, nu Redis — vezi „Întrebări deschise". Tokenul nu se
stochează niciodată: doar un SHA-256 al lui, ca un dump scurs al tabelei să nu ofere cuiva un set de
sesiuni funcționale. SHA-256 și nu bcrypt, fiindcă valoarea e deja 256 de biți de aleatoriu semnat,
deci n-are ce fi spart prin forță brută, iar fiecare refresh trebuie s-o caute după hash.

Refresh-ul rotește: tokenul prezentat e consumat și înlocuit. O semnătură validă nu mai e de ajuns —
tokenul trebuie să fie și cel viu al sesiunii lui.

**Refolosirea unuia deja consumat revocă tot lanțul.** E semnalul de furt: clientul legitim și
atacatorul nu pot ține amândoi cel mai nou token, deci un replay înseamnă că cineva a copiat unul.
Furtul costă ambele sesiuni, în loc să treacă neobservat șapte zile.

`POST /auth/logout` nu cere access token — cel de acces poate fi deja expirat, ceea ce e cazul
obișnuit; credențiala e refresh tokenul din body, iar revocarea unuia necunoscut nu face nimic.
Plus `POST /auth/logout-all` și `GET /auth/sessions`, care nu întoarce niciodată hash-urile.

**Revocarea acoperă refresh-ul, nu și access tokenul.** `AuthGuard` verifică doar semnătura JWT, deci
după `logout-all` un access token deja emis mai merge până la 15 minute. Compromis deliberat:
alternativa e o interogare în baza de date la fiecare cerere autentificată. Scris aici fiindcă
„logout-ul funcționează cu adevărat" din Definition of Done se citea altfel.

**Rotația e atomică sub concurență, cu blocare pe rând.** Prima formă claim-uia tokenul cu un UPDATE
condiționat și insera succesorul în afara oricărei tranzacții — deci un replay concurent putea
detecta refolosirea și mătura familia *înainte* ca succesorul să fi fost inserat, iar tokenul rămânea
viu. Reprodus cu cinci refresh-uri simultane: patru 401-uri, și succesorul funcționa în continuare.
Acum tranzacția ia `SELECT … FOR UPDATE` pe rândul tokenului, iar măturarea familiei se face după
commit, în afara tranzacției — altfel 401-ul de după ar da rollback tocmai revocării.

**Un bug prins pe drum:** refresh tokenul era semnat doar cu `sub`, deci două login-uri în aceeași
secundă produceau un JWT identic octet cu octet — și hash identic pe o coloană unică. Are acum un
`jti`.

### S8 · Audit de autorizare

Fiecare endpoint e trecut prin listă: are `AuthGuard`? are `RolesGuard` unde trebuie? aplică
filtrarea pe date din service pentru non-admini? Rezultatul e un tabel în acest fișier, actualizat
la fiecare endpoint nou.

Tiparul de referință e cel din `apps/api/src/modules/invoice/invoice.service.ts:92`:

```ts
if (role !== Role.ADMIN) {
    qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
}
```

**Acceptanță:** tabelul e complet și fiecare rând are un test în [E03](E03-testare-ci.md).

**Livrat, dar generat, nu scris de mână.** Un tabel întreținut manual e greșit din prima clipă în
care cineva uită să-l actualizeze, iar un tabel de autorizare învechit e mai rău decât niciunul: se
citește ca o garanție. `pnpm --filter api authorization:table` îl produce din aceleași metadate Nest
pe care le verifică `src/authorization.spec.ts`.

**Prima versiune nu se ținea de promisiune.** Lista de controllere era scrisă de mână, în două
copii — una în test, una în script — și divergaseră deja în același PR: scriptul știa de
`HealthController`, testul nu. Deci două rânduri din tabel apăreau ca „public" fără ca vreun test
să le fi verificat vreodată, exact garanția pe care textul o vindea. Acum lista e una singură,
`src/testing/controllers.ts`, iar `authorization.spec.ts` compară separat lista cu fișierele
`*.controller.ts` de pe disc: un controller nou care nu e trecut în ea pică suita, în loc să-și
scoată tăcut toate endpoint-urile din matrice.

Coloana „restrâns pe date" e singura scrisă de mână: reflecția vede guard-ele, nu ce face
service-ul. E lista din script, iar testele unitare cu `isScopedToUser` o verifică.

| Method | Route | Handler | AuthGuard | Role | Row-scoped |
|---|---|---|---|---|---|
| PATCH | `/attendance/:attendanceId` | `AttendanceController.updateAttendance` | yes | ADMIN | — |
| POST | `/attendance/:groupId` | `AttendanceController.createAttendance` | yes | ADMIN | — |
| GET | `/attendance/child/:childId` | `AttendanceController.getAttendanceByChild` | yes | any | yes |
| POST | `/auth/login` | `AuthController.login` | **public** | any | — |
| POST | `/auth/logout` | `AuthController.logout` | **public** | any | — |
| POST | `/auth/logout-all` | `AuthController.logoutEverywhere` | yes | any | yes |
| GET | `/auth/me` | `AuthController.getProfile` | yes | any | — |
| POST | `/auth/refresh` | `AuthController.refresh` | **public** | any | — |
| POST | `/auth/register` | `AuthController.register` | **public** | any | — |
| GET | `/auth/sessions` | `AuthController.sessions` | yes | any | yes |
| GET | `/children` | `ChildController.findChildren` | yes | any | yes |
| POST | `/children` | `ChildController.createChild` | yes | any | yes |
| DELETE | `/children/:childId` | `ChildController.deleteChild` | yes | any | yes |
| PUT | `/children/:childId` | `ChildController.updateChild` | yes | any | yes |
| DELETE | `/children/:childId/groups/:groupId` | `ChildController.removeChildFromGroup` | yes | ADMIN | — |
| POST | `/children/:childId/groups/:groupId` | `ChildController.assignChildToGroup` | yes | ADMIN | — |
| GET | `/discounts` | `DiscountController.findDiscounts` | yes | ADMIN | — |
| POST | `/discounts` | `DiscountController.createDiscount` | yes | ADMIN | — |
| DELETE | `/discounts/:id` | `DiscountController.deleteDiscount` | yes | ADMIN | — |
| PUT | `/discounts/:id` | `DiscountController.updateDiscount` | yes | ADMIN | — |
| GET | `/groups` | `GroupController.getGroups` | yes | any | — |
| POST | `/groups` | `GroupController.createGroup` | yes | ADMIN | — |
| DELETE | `/groups/:id` | `GroupController.deleteGroup` | yes | ADMIN | — |
| GET | `/groups/:id` | `GroupController.getGroupById` | yes | ADMIN | — |
| PUT | `/groups/:id` | `GroupController.updateGroup` | yes | ADMIN | — |
| GET | `/health` | `HealthController.health` | **public** | any | — |
| GET | `/invoices` | `InvoiceController.findInvoices` | yes | any | yes |
| POST | `/invoices` | `InvoiceController.createInvoice` | yes | ADMIN | — |
| DELETE | `/invoices/:id` | `InvoiceController.remove` | yes | ADMIN | — |
| GET | `/invoices/:id` | `InvoiceController.findOne` | yes | any | yes |
| PUT | `/invoices/:id` | `InvoiceController.update` | yes | ADMIN | — |
| GET | `/invoices/:id/pdf` | `InvoiceController.getInvoicePdf` | yes | any | yes |
| POST | `/invoices/preview` | `InvoiceController.previewInvoicePdf` | yes | ADMIN | — |
| GET | `/payments` | `PaymentController.findPayments` | yes | any | yes |
| POST | `/payments` | `PaymentController.createPayment` | yes | ADMIN | — |
| DELETE | `/payments/:id` | `PaymentController.deletePayment` | yes | ADMIN | — |
| GET | `/payments/:id` | `PaymentController.findOne` | yes | any | yes |
| PUT | `/payments/:id` | `PaymentController.updatePayment` | yes | ADMIN | — |
| GET | `/profiles` | `ProfileController.findProfiles` | yes | any | yes |
| POST | `/profiles` | `ProfileController.createProfile` | yes | any | yes |
| DELETE | `/profiles/:profileId` | `ProfileController.deleteProfile` | yes | any | yes |
| PUT | `/profiles/:profileId` | `ProfileController.updateProfile` | yes | any | yes |
| GET | `/ready` | `HealthController.ready` | **public** | any | — |
| GET | `/users` | `UserController.getAllUsers` | yes | ADMIN | — |
| DELETE | `/users/:id` | `UserController.deleteUser` | yes | ADMIN | — |
| GET | `/users/:id` | `UserController.getUserById` | yes | ADMIN | — |
| PUT | `/users/:id` | `UserController.updateUser` | yes | ADMIN | — |
| GET | `/users/without-profile` | `UserController.getUsersWithoutProfile` | yes | ADMIN | — |
48 endpoints.

De regenerat după fiecare endpoint nou.

### S9 · CORS din configurație

Lista de origini vine dintr-o variabilă de mediu, nu din cod.

**Acceptanță:** adăugarea unui domeniu nu cere redeploy de cod.

**Livrat încă din [E01](E01-infrastructura-medii.md).** `CORS_ORIGINS` e o listă separată prin
virgulă; fără ea rămân domeniul de producție și frontend-ul local.

## Dependențe

[E03](E03-testare-ci.md), pentru că S1 va rupe lucruri și trebuie să știi care.
[E04](E04-migrari-date.md), pentru tabelul de sesiuni din S7.

## Riscuri

**S1 e cel mai riscant story din tot planul.** Activarea validării pe 22 de DTO-uri niciodată
executate va respinge cereri care astăzi trec. Frontend-ul trimite probabil câmpuri în plus, pe care
`forbidNonWhitelisted` le va refuza. Trebuie făcut cu testele de integrare deja scrise, și pus
întâi în modul care doar loghează încălcările, câteva zile, înainte de a respinge.

## Definition of done

Nicio cerere nevalidată nu ajunge într-un service. Aplicația nu pornește configurată greșit. Fiecare
eroare are id de corelare. Logout-ul funcționează cu adevărat.

## Ce a scos la iveală al doilea review

Prima trecere a livrat E05 cu 120 de teste de integrare verzi. O a doua trecere, adversarială și cu
aplicația chiar pornită pe date de seed, a găsit lucruri pe care nicio suită nu le atingea. Sunt
scrise aici fiindcă tiparul se repetă, nu bug-urile.

**O breșă de autorizare, într-un singur caracter.** `PaymentService.findOne` compunea restrângerea
pe utilizator cu `andWhere` și apoi adăuga filtrul pe id cu `where` — care *înlocuiește* toată
clauza. Orice părinte autentificat putea citi plata oricărei alte familii, cu factura și profilul
complet atașate: nume, e-mail, telefon, adresă. Testul unitar `isScopedToUser` verifica doar că s-a
adăugat un `andWhere`, nu că a supraviețuit. Reprodus cu doi părinți reali.

**Bug-urile de contract nu se văd din backend.** Trei dintre cele mai grave — telefonul, adresa
goală, tokenul de refresh aruncat de client — sunt toate în `apps/web`, toate provocate de o
schimbare din `apps/api`, și niciuna vizibilă din testele de integrare.

**Ce nu se vede fără concurență.** Rotația de tokenuri trecea toate testele secvențial și pica la
cinci cereri simultane. Testele secvențiale sunt un eșantion, nu o dovadă, pe orice cod care are
stare partajată.

**Ce nu se vede fără să rulezi.** `/ready` întorcea corect 503 cu baza *oprită* și atârna la
nesfârșit cu baza *blocată*. Diferența nu se citește din cod; se vede punând containerul pe pauză.

**Cifre care sunau a garanție.** „Toate cele 48 de rânduri au deja teste" — două nu aveau.
Un `coverageThreshold` configurat pe trei fișiere, pe care CI nu-l rula. `session.service.ts`, care
duce tot S7, avea 19% acoperire și niciun test unitar.

## Întrebări deschise

Ambele au primit răspuns.

**Sesiunile în Postgres sau Redis?** Postgres, cum recomanda epicul. La volumul actual e suficient,
iar o piesă de infrastructură în plus ar trebui operată. Tabelul are indecși pe `tokenHash` și
`familyId`, care sunt singurele căi de căutare.

**`ValidationPipe` întâi în modul permisiv?** Nu — dar motivul scris aici prima oară era greșit, și
a costat.

Argumentul era „premisa a dispărut: sfatul presupune trafic de producție care s-ar rupe, iar
aplicația n-a fost deployată niciodată". Premisa acoperea însă doar jumătate din expunere:
**backend-ul** n-a fost deployat, dar frontend-ul e pe Vercel și e un client viu. Iar testele de
integrare își construiesc singure payload-urile, deci prin construcție nu pot prinde o ruptură de
contract între frontend și backend. „S-a rupt exact un test" a fost citit ca dovadă că nu s-a rupt
nimic altceva.

Ce se rupsese de fapt, descoperit abia la un al doilea review: ecranul de completare a profilului —
pasul obligatoriu prin care trece orice părinte nou — devenise imposibil de trecut. Formularul cere
exact zece cifre la telefon, API-ul cerea format internațional; niciun număr nu satisface ambele.
Câmpul de adresă lăsat gol trimite `""`, pe care `@IsOptional() @Length(1, 255)` îl respinge. Iar
compozabilul înghițea eroarea și întorcea codul de status, deci pagina naviga ca la succes, fără
mesaj, și middleware-ul o trimitea înapoi la formular. O buclă infinită, tăcută, cu 120 de teste de
integrare verzi.

**Regula care rămâne:** un story nu e livrat cât timp singurul client real nu a fost verificat pe el.
O verificare de contract care rulează doar pe jumătatea de backend nu e o verificare de contract.

## Ce a mai ieșit la iveală

**`revokedAt: undefined` într-un `where` e eliminat de TypeORM**, la fel ca bug-ul de la crearea de
profiluri din [E04](E04-migrari-date.md). Prima formă a lui `revoke()` folosea asta și nu revoca
nimic — logout-ul răspundea 200 și tokenul continua să meargă. Acum e `IsNull()` explicit. Merită
reținut ca tipar: în TypeORM, `undefined` într-o condiție înseamnă „ignoră condiția", nu „e null".

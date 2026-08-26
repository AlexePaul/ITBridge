# E05 · Robustețe backend

**Status:** propus · **Pistă:** Fundație · **Depinde de:** E03, E04 · **Blochează:** E06, E07, E17

## Problemă

Backend-ul "se simte shaky", și există un motiv precis, verificabil.

**Validarea nu rulează.** 22 de fișiere DTO au decoratori `class-validator` — `@IsEmail`,
`@MinLength(6)`, `@IsPhoneNumber`. Niciun `ValidationPipe` nu e înregistrat în `main.ts`, și nu
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
- **Secrete cu fallback tăcut.** `jwtConstants.ts` cade pe `'defaultAccessSecret'` și
  `'defaultRefreshSecret'` dacă variabilele lipsesc. O producție pornită fără ele semnează tokenuri
  cu un secret public, și nimic nu avertizează.
- **Refresh tokens nerevocabile.** Sunt stateless. Nu există logout server-side, nici listă de
  revocare. Un token furat e valid șapte zile, indiferent ce faci.
- **CORS hardcodat** în `main.ts` pe `https://itbridgeschool.com` și `http://localhost:3001`.
- **Configurație împrăștiată.** `process.env` citit direct în `app.module.ts` și în constante,
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

### S2 · Formă unică de eroare

Exception filter global. Fiecare eroare are `statusCode`, `message`, `code`, `requestId`, plus
`details` pe erorile de validare. Erorile TypeORM nu se scurg niciodată către client — o violare de
constrângere unică devine 409 cu mesaj util, nu 500 cu SQL în el.

**Acceptanță:** frontend-ul are un singur loc care interpretează erori. Niciun răspuns de eroare nu
conține nume de tabele sau SQL.

### S3 · Configurație validată la pornire

`ConfigModule` cu schemă de validare. Aplicația **refuză să pornească** dacă lipsește un secret
JWT, dacă e egal cu valoarea default, sau dacă lipsește configurația de bază de date. Fallback-urile
din `jwtConstants.ts` dispar.

**Acceptanță:** pornire fără `JWT_ACCESS_TOKEN_SECRET` eșuează cu mesaj explicit, în loc să meargă
mai departe cu `'defaultAccessSecret'`.

### S4 · Logging structurat

Logger JSON, cu id de corelare pe fiecare cerere, propagat în loguri. Fiecare cerere lasă o linie:
metodă, rută, status, durată, id de utilizator. Fără date personale în loguri — vezi
[E07](E07-securitate-gdpr.md).

**Acceptanță:** un id de corelare dintr-un răspuns de eroare regăsește tot lanțul în loguri.

### S5 · Health și readiness

`GET /health` răspunde fără să atingă baza de date. `GET /ready` verifică baza de date și S3.
PM2 și uptime checker-ul le folosesc.

**Acceptanță:** `/health` răspunde 200 în sub 50ms. `/ready` întoarce 503 cu Postgres oprit.

### S6 · Rate limiting

Throttler pe `/auth/login`, `/auth/register`, `/auth/refresh`, și pe orice endpoint care trimite
email după [E17](E17-comunicare-notificari.md). Limite pe IP și pe cont.

**Acceptanță:** a unsprezecea încercare de login într-un minut primește 429.

### S7 · Sesiuni revocabile și logout

Refresh tokenurile devin urmăribile: tabel de sesiuni cu id, utilizator, dată de emitere, expirare,
revocare, user agent. Refresh-ul rotește tokenul și îl invalidează pe cel vechi; refolosirea unuia
deja consumat invalidează întregul lanț, ca semnal de furt. `POST /auth/logout` revocă sesiunea.

**Acceptanță:** un logout face refresh tokenul inutilizabil imediat. Un părinte își poate vedea și
încheia sesiunile active.

### S8 · Audit de autorizare

Fiecare endpoint e trecut prin listă: are `AuthGuard`? are `RolesGuard` unde trebuie? aplică
filtrarea pe date din service pentru non-admini? Rezultatul e un tabel în acest fișier, actualizat
la fiecare endpoint nou.

Tiparul de referință e cel din `invoice.service.ts:50`:

```ts
if (role !== Role.ADMIN) {
    qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
}
```

**Acceptanță:** tabelul e complet și fiecare rând are un test în [E03](E03-testare-ci.md).

### S9 · CORS din configurație

Lista de origini vine dintr-o variabilă de mediu, nu din cod.

**Acceptanță:** adăugarea unui domeniu nu cere redeploy de cod.

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

## Întrebări deschise

- Sesiunile în Postgres sau în Redis? Postgres e suficient la volumul actual și evită o piesă de
  infrastructură în plus.
- Punem `ValidationPipe` întâi în modul permisiv cu logare? Recomand da, o săptămână.

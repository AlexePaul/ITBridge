# Runbook — când ceva nu merge

Pași concreți pentru situațiile previzibile, scriși pentru cineva care n-a scris codul
([E06](epics/E06-observabilitate-operare.md) S5). Fiecare secțiune începe cu ce vezi și se termină
cu cum știi că s-a rezolvat. Comenzile sunt pentru **stage** (`api-stage.itbridgeschool.com`); pentru
producție, după lansare, se înlocuiește `stage` cu `prod` peste tot.

**Starea de azi, ca să nu cauți ce nu există:** în producție rulează doar site-ul public, pe Vercel.
Platforma (portalul, zona de admin, API-ul) rulează pe stage — vezi CLAUDE.md, „Cele două
branch-uri".

## Pe scurt: ce vezi → unde te uiți

| Ce vezi                                                            | Secțiunea                                      |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Un mesaj „A apărut o eroare pe server… (cod 3f2a9c1d)"             | [2. Un bug](#2-un-bug)                         |
| Un toast „Ceva n-a mers pe ecranul acesta", cu un cod              | [2. Un bug](#2-un-bug)                         |
| Portalul se încarcă, dar nimic nu vine („Serviciul… indisponibil") | [3.1](#31-api-ul-nu-răspunde)                  |
| După un merge, ceva care mergea nu mai merge                       | [3.2](#32-un-deploy-a-stricat-ceva)            |
| Rularea „Deploy" din GitHub e roșie                                | [3.3](#33-deploy-ul-pică)                      |
| `/ready` spune că baza nu răspunde                                 | [3.4](#34-baza-de-date)                        |
| „No space left on device" în loguri                                | [3.5](#35-discul-e-plin)                       |
| Browserul spune că certificatul nu e valid                         | [3.6](#36-https-și-certificatul)               |
| Facturile nu se descarcă, lucrările nu se încarcă                  | [3.7](#37-stocarea-s3)                         |
| Familiile nu primesc emailuri                                      | [3.8](#38-emailurile)                          |
| O factură stă „în verificare" la SmartBill                         | [3.9](#39-smartbill)                           |
| Site-ul public nu se încarcă                                       | [3.10](#310-site-ul-vercel)                    |
| Cineva nu se poate autentifica                                     | [3.11](#311-conturi)                           |
| Lucrările copiilor nu mai apar din birou                           | [3.12](#312-agentul-din-birou)                 |
| Vrei stage cu date proaspete, de la zero, înaintea unei testări    | [3.14](#314-stage-cu-date-proaspete)           |
| Datele sunt greșite și trebuie corectate                           | [4. Corectarea datelor](#4-corectarea-datelor) |

## 1. Unde te uiți întâi

1. **`/admin/erori`** — fiecare 500, fiecare eroare scrisă de un job și fiecare ecran stricat în
   browserul cuiva autentificat, cu codul de pe ecran, contul, adresa paginii și stack trace-ul pe
   liniile din `.ts`. Cifra roșie din meniu („Sistem → Erori") e numărul celor nerezolvate.
2. **Tabloul de bord** (`/admin/dashboard`) — mesaje nelivrate, cataloage nefăcute, conturi în
   așteptare.
3. **GitHub → Actions → „Deploy"** — ultima rulare pe `release/stage`: verde înseamnă că e pe
   server exact ce e pe branch.
4. **`https://api-stage.itbridgeschool.com/ready`** — `{"status":"ready","checks":{"database":"ok","objectStorage":"ok"}}`
   înseamnă că API-ul, baza și stocarea răspund. `/health` spune doar că procesul trăiește.

### Cum ajungi pe instanță

Nu există SSH și nu există chei: se intră prin **AWS Systems Manager**.

- **Din consolă:** AWS → EC2 (regiunea **Europe (Stockholm), eu-north-1**) → Instances → instanța →
  **Connect** → **Session Manager** → Connect. Se deschide un terminal în browser, ca `ssm-user`.
- **Din terminal**, cu AWS CLI și pluginul Session Manager instalate:
  `aws ssm start-session --target <id-ul instanței> --region eu-north-1`.

Aplicația rulează ca utilizatorul `deploy`, deci primul pas e întotdeauna:

```sh
sudo -iu deploy
pm2 ls                                   # procesele și numele lor; coloana „status" trebuie să fie „online"
pm2 logs <nume> --lines 200 --nostream   # ultimele 200 de linii, fără să rămână deschis
```

Ce e unde pe instanță (nimic din lista asta nu e în repo):

| Ce                                                                     | Unde                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Clona repo-ului pe care rulează mediul                                 | `/srv/itbridge/stage`                                                  |
| Scripturile de deploy, de mediu și de backup; configurația PM2         | `/srv/itbridge/{deploy.sh,fetch-env.sh,backup.sh,ecosystem.config.js}` |
| Variabilele de mediu, regenerate din Parameter Store la fiecare deploy | `/etc/itbridge/stage.env` (640, `root:deploy`)                         |
| Postgres 17 și Caddy                                                   | servicii `systemd` pe aceeași mașină                                   |

## 2. Un bug

Un bug se repară cu o schimbare de cod care trece prin PR, ca orice altceva. Scurtătura de pe server
nu există: un fișier editat pe instanță dispare la următorul deploy.

1. **Ia codul.** De pe ecranul cui a întâlnit eroarea („cod 3f2a9c1d"), din toastul de eroare, sau —
   dacă nu e niciun cod — ora și ce a apăsat.
2. **Găsește eroarea.** `/admin/erori` → câmpul „Cod de pe ecran" → Caută. Rândul spune:
   - **originea** — ruta API (`GET /invoices/:id`), numele jobului sau pagina și componenta din
     browser;
   - **mesajul** și **stack trace-ul** — primul rând din `apps/api/src/...` sau `apps/web/app/...`
     e de obicei locul;
   - **aparițiile** — cine, când, la ce adresă. Linkul duce la familia care a întâlnit eroarea.

   **Fără cod** — un număr greșit, un rând lipsă, nimic roșu —, pornești de la ecran:
   [harta-ecranelor.md](harta-ecranelor.md) spune, pentru fiecare adresă din bara browserului,
   fișierul paginii, cererile pe care le face și serviciul care răspunde la fiecare. Același lucru îl
   vezi în browser: DevTools → Network, cererea care aduce numărul greșit.

3. **Reprodu local**, pe o bază de dezvoltare:

   ```sh
   git switch release/stage && git pull
   cp .env.example .env          # o dată; apoi cele două JWT_*_SECRET, fiecare cu openssl rand -base64 48
   pnpm install
   docker compose up -d          # Postgres + MinIO
   pnpm --filter api migration:run
   pnpm seed                     # admin / parola123; SEED_TODAY=2026-03-16 pnpm seed fixează ziua
   pnpm dev                      # API pe :3000, site pe :3001
   ```

   Fă aceiași pași ca în aparițiile din `/admin/erori`. Eroarea apare și local, în `/admin/erori`
   de pe laptop.

4. **Scrie întâi un test care pică** — unitar lângă cod (`*.spec.ts`), sau de integrare în
   `apps/api/test/` (`pnpm test:e2e`, cere Docker pornit). Convenția e în CLAUDE.md, „Testare".
5. **Repară**, apoi rulează ce rulează CI-ul:

   ```sh
   pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
   ```

6. **PR în `release/stage`**, pe un branch nou. CI-ul rulează aceleași verificări plus cele de
   accesibilitate; după merge, „Deploy" pune schimbarea pe stage în vreo zece minute.
7. **Verifică pe stage** pașii din aparițiile erorii, apoi **„Marchează rezolvată"** pe
   `/admin/erori`. Dacă eroarea revine, apare un rând nou — e o veste, nu același rând.

**Dacă folosești Claude Code**, dă-i în sesiune exact ce e pe rând: codul, originea, mesajul,
stack trace-ul și pașii. Cu ele își găsește singur fișierul, iar testul care pică e primul lucru pe
care să i-l ceri.

**Un mesaj în engleză pe ecran** e tot un bug, mai mic: codul de eroare n-are încă propoziția lui în
română. Se adaugă în `MESSAGES` din `apps/web/app/composables/useApiError.ts`.

## 3. Incidente

### 3.1 API-ul nu răspunde

**Ce vezi:** portalul se încarcă, dar listele rămân goale sau spun „Serviciul este momentan
indisponibil"; `/health` nu răspunde sau răspunde 502.

1. GitHub → Actions → ultima rulare „Deploy". Dacă e roșie la pasul de pe instanță, mergi la
   [3.3](#33-deploy-ul-pică).
2. Pe instanță (secțiunea 1): `pm2 ls`. Procesul trebuie să fie `online`, cu `restarts` care nu cresc.
3. `pm2 logs <nume> --lines 200 --nostream`. Cele mai dese cauze, în ordine:
   - **Refuzul de pornire:** o linie cu numele unei variabile (`JWT_…`, `AWS_S3_BUCKET`, `SCHOOL_IBAN`,
     `NODE_ENV`…). Variabila se corectează în **Parameter Store** (AWS → Systems Manager → Parameter
     Store), apoi se reia deploy-ul (GitHub → rularea „Deploy" → Re-run jobs). Pe stage,
     **`NODE_ENV` trebuie să fie `stage`**, niciodată `production`.
   - **Baza nu răspunde:** `ECONNREFUSED 127.0.0.1:5432` → [3.4](#34-baza-de-date).
   - **Discul e plin:** `ENOSPC` → [3.5](#35-discul-e-plin).
4. Pornirea de mână, după ce ai corectat cauza: `pm2 restart <nume>`, apoi `/ready` din nou.

**Rezolvat când:** `/ready` răspunde `ready`, iar portalul își încarcă datele.

### 3.2 Un deploy a stricat ceva

**Ce vezi:** după un merge în `release/stage`, un ecran care mergea nu mai merge.

Revenirea e un commit, nu o comandă pe server: `deploy.sh` pune pe instanță capul branch-ului, deci
o rulare veche reluată ar pune tot codul de acum.

```sh
git fetch origin
git switch -c revert-<ce-anume> origin/release/stage
git revert <sha-ul commitului din PR>     # PR-urile se unesc squash, deci e un commit simplu
git push -u origin revert-<ce-anume>
```

Apoi PR în `release/stage` și merge după CI. „Deploy" pune pe stage versiunea de dinainte.

**Dacă PR-ul stricat avea o migrare** (un fișier nou în `apps/api/src/migrations/`), revert-ul
scoate fișierul, dar nu și schimbarea din bază. Aproape întotdeauna nu contează — o coloană nouă e
ignorată de codul vechi. Dacă migrarea a șters sau a redenumit ceva de care codul vechi are nevoie,
**înainte** de merge-ul revert-ului, pe instanță, cât timp codul cu migrarea e încă acolo:

```sh
sudo -iu deploy
cd /srv/itbridge/stage
set -a; . /etc/itbridge/stage.env; set +a
pnpm --filter api migration:revert       # desface ultima migrare rulată, una singură
```

**Rezolvat când:** ecranul merge din nou pe stage, iar rularea „Deploy" a revert-ului e verde.

### 3.3 Deploy-ul pică

GitHub → Actions → rularea „Deploy" → jobul roșu → pasul roșu.

- **„verify" (CI) e roșu:** codul nu trece testele — nu s-a deployat nimic, pe server e în continuare
  versiunea de dinainte. Se repară în cod (secțiunea 2). Dacă jobul „Integration tests" e roșu fără
  niciun test rulat, e infrastructura (imaginea MinIO) — vezi CLAUDE.md, „Capcane".
- **Pasul de pe instanță e roșu:** logul rulării are ieșirea lui `deploy.sh`. Build picat, migrare
  picată sau `/ready` care nu răspunde. Dacă a picat migrarea, versiunea veche servește mai departe;
  migrarea se repară într-un PR nou.
- **Ultimul pas, `/ready`, e roșu:** procesul nou a pornit, dar nu vede baza sau stocarea →
  [3.4](#34-baza-de-date) sau [3.7](#37-stocarea-s3).

### 3.4 Baza de date

**Ce vezi:** `/ready` răspunde 503; în loguri, `ECONNREFUSED 127.0.0.1:5432` sau `too many clients`.

```sh
systemctl list-units --type=service | grep -i postgres   # numele serviciului
sudo systemctl status <serviciul>
sudo journalctl -u <serviciul> --since "1 hour ago" --no-pager | tail -50
df -h                                                    # o bază oprită e des un disc plin
sudo systemctl start <serviciul>                         # dacă e oprită
```

`too many clients`: `pm2 restart <nume>` eliberează conexiunile aplicației.

**Rezolvat când:** `/ready` spune `"database":"ok"`.

### 3.5 Discul e plin

```sh
df -h                                        # care partiție
sudo du -xh / --max-depth=2 2>/dev/null | sort -h | tail -20
```

Ce se poate șterge fără grijă, în ordinea în care crește de obicei:

- logurile PM2: `pm2 flush` (ca `deploy`). Rotația lor e modulul `pm2-logrotate`; `pm2 conf
pm2-logrotate` arată dacă e pornit;
- jurnalul sistemului: `sudo journalctl --vacuum-time=7d`;
- depozitul pnpm: `pnpm store prune` (ca `deploy`).

**Nu** se șterge nimic din directorul de date al Postgres-ului. **Rezolvat când:** `df -h` arată loc
liber, iar `/ready` e `ready` (dacă baza s-a oprit, pornește-o, [3.4](#34-baza-de-date)).

### 3.6 HTTPS și certificatul

Certificatele le ia și le reînnoiește **Caddy** singur. Dacă browserul refuză certificatul:

```sh
sudo systemctl status caddy
sudo journalctl -u caddy --since "1 day ago" --no-pager | grep -i -E "error|certificate" | tail -30
sudo systemctl reload caddy
```

Cauzele obișnuite: numele DNS nu mai arată spre instanță, sau porturile 80 și 443 sunt închise în
security group-ul instanței — Let's Encrypt are nevoie de 80 ca să verifice.

### 3.7 Stocarea (S3)

**Ce vezi:** PDF-ul facturii sau fișierul unei lucrări nu se descarcă; `/ready` spune că stocarea nu
răspunde (`objectStorage`). **Emiterea facturilor nu depinde de S3** — PDF-ul se desenează la prima descărcare —, deci
luna se poate emite oricum.

Accesul e **rolul instanței** (IAM), fără chei. Se verifică: rolul e încă atașat instanței (EC2 →
instanța → Security → IAM role), bucket-ul din `AWS_S3_BUCKET` există, regiunea din `AWS_REGION`
e a lui. Pe instanță: `aws s3 ls s3://<bucket> --region <regiunea>` trebuie să listeze ceva.

### 3.8 Emailurile

`/admin/livrari` spune ce s-a întâmplat cu fiecare mesaj, iar tabloul de bord numără trei feluri de
„n-a ajuns":

- **blocat** (coada nu s-a mișcat de 15 minute) — cheia de trimitere lipsește sau dispecerul e oprit.
  **Pe stage e dinadins:** `MAIL_OUTBOX_ENABLED=false`, nu pleacă nimic. În producție se verifică
  `MAIL_RESEND_API_KEY` și `MAIL_FROM` în Parameter Store; când apar, coada pleacă singură, întreagă;
- **eșuat** — furnizorul a refuzat; motivul e pe rând;
- **nelivrabil** — familia n-are adresă sau n-a confirmat-o. Se completează adresa în fișa familiei;
  rândul numește familia.

**Linkurile din mesaje duc pe alt domeniu.** API-ul le construiește din `SITE_URL`; nesetată, cade
pe `https://itbridgeschool.com`, care e corect în producție și greșit pe stage — acolo site-ul public
n-are paginile de confirmare, de resetare sau de cont. Pe stage, `SITE_URL=https://stage.itbridgeschool.com`
în Parameter Store, apoi un deploy (sau `fetch-env.sh` și `pm2 reload`). Mesajele scrise înainte
rămân cu linkul vechi; se cere unul nou (retrimite confirmarea, „Ți-ai uitat parola?" din nou).

### 3.9 SmartBill

Implicitul e `SMARTBILL_MODE=off`: nu se trimite nimic la SmartBill. Pe stage, cel mult `draft`.

- **O factură „în verificare"** (`review`): un răspuns s-a pierdut și seria s-a mișcat. Se deschide
  SmartBill Cloud, se caută factura; dacă e acolo, „Confirmă numărul" cu numărul ei, dacă nu,
  „Retrimite". Platforma nu adoptă niciodată singură un număr.
- **Blocare pentru prea multe cereri:** coada așteaptă singură zece minute; nu e nimic de făcut.
- **Divergențe** (suma încasată diferă între platformă și SmartBill): `/admin/reconciliere`, fila
  divergențelor, spune motivul și unde se repară.

Detaliile sunt în CLAUDE.md, „Factura fiscală e a SmartBill".

### 3.10 Site-ul (Vercel)

Vercel → proiectul → **Deployments**. Dacă ultimul deploy e roșu, logul lui spune de ce; dacă e
verde, dar site-ul e stricat, deploy-ul de dinainte se readuce cu **„Instant Rollback"** (meniul
„…" al deploy-ului bun) — fără niciun commit. Apoi se repară în cod, ca în secțiunea 2.

### 3.11 Conturi

- **Un admin și-a uitat parola:** pe instanță, ca `deploy`, în `/srv/itbridge/stage`:
  `pnpm --filter api admin:create --username <nume> --reset-password`. E singura cale: un admin n-are
  profil, deci linkul de resetare n-are unde pleca.
- **Un părinte nu se poate autentifica:** „Parolă uitată" din formular trimite un link valabil o oră.
  Dacă intră, dar nu vede nimic: „Conturi în așteptare" (`/admin/approvals`) — contul poate aștepta confirmarea emailului,
  aprobarea biroului, sau poate fi respins ori suspendat; pagina familiei spune care.
- **O familie trecută de birou vrea cont:** din pagina familiei, „Trimite linkul de cont".

### 3.12 Agentul din birou

`/admin/proiecte` arată când a raportat ultima dată agentul și ultima lui eroare. Dacă a tăcut:
calculatorul din birou e pornit, serviciul Windows al agentului rulează, partajarea de rețea e
accesibilă. Instalarea și configurarea sunt în [apps/agent/README.md](../apps/agent/README.md).
Fișierele nu se pierd cât agentul e oprit: partajarea e coada, iar la repornire urcă tot.

### 3.13 Restaurarea din backup

`/srv/itbridge/backup.sh` face zilnic, la 03:15, un `pg_dump` al fiecărei baze și îl urcă în S3;
bucket-ul și prefixul sunt scrise în script. **Procedura de mai jos n-a fost încă probată pe instanță**
([E04](epics/E04-migrari-date.md) S4 rămâne deschis până se face), deci se încearcă întâi pe o bază
de probă, nu peste cea bună:

```sh
aws s3 ls s3://<bucket>/<prefix>/ | tail -5                 # cel mai nou dump
aws s3 cp s3://<bucket>/<prefix>/<fișier> /tmp/restore.dump
sudo -u postgres createdb restore_proba
sudo -u postgres pg_restore --no-owner -d restore_proba /tmp/restore.dump   # format custom (-Fc)
# sau, pentru un .sql.gz: gunzip -c /tmp/restore.dump | sudo -u postgres psql restore_proba
```

Se verifică în `restore_proba` că tabelele au rânduri (`SELECT count(*) FROM profiles;`), apoi, doar
dacă baza bună e pierdută, se oprește aplicația (`pm2 stop <nume>`), se restaurează la fel în baza
din `DB_NAME` și se repornește. Durata se notează în E04 S4 — e acceptanța story-ului.

### 3.14 Stage cu date proaspete

**Când:** înaintea unei testări de la cap la coadă ([plan-de-testare.md](plan-de-testare.md)), sau
când datele de pe stage au ajuns într-o stare din care nu mai înveți nimic. **Numai pe stage**: seed-ul
**golește toate tabelele** și scrie datele de dezvoltare — ce a tastat cineva pe stage dispare. În
producție refuză oricum.

Se rulează **pe instanță**, fiindcă Postgres stă lângă API și nu se vede din afară:

```sh
sudo -iu deploy
cd /srv/itbridge/stage
set -a; . /etc/itbridge/stage.env; set +a
read -rs -p "Parola conturilor de pe stage: " SEED_PASSWORD; echo; export SEED_PASSWORD
pm2 stop <nume>        # ca joburile să nu scrie în timp ce baza se golește
pnpm seed              # sau SEED_TODAY=2026-10-05 pnpm seed, ca „azi" să fie ziua testării
pm2 start <nume>
```

Două lucruri pe care seed-ul le refuză, dinadins:

- **`NODE_ENV=production`**: refuză orice, oricât de local ar fi host-ul. Dacă vezi refuzul pe stage,
  `NODE_ENV` din Parameter Store e încă `production` și trebuie pus `stage` — vezi CLAUDE.md,
  „Infrastructură — stare reală". Tot `stage` e ce oprește stage-ul să emită facturi SmartBill reale.
- **Fără `SEED_PASSWORD`**, sub `NODE_ENV=stage`: host-ul e `localhost`, dar stage-ul e public, iar
  parola implicită, `parola123`, e scrisă în repo. `read -rs` o cere fără s-o arate și fără s-o lase în
  istoricul shell-ului; seed-ul nu o tipărește înapoi.

**Cum știi că a mers:** seed-ul tipărește la final ce a scris, iar pe `stage.itbridgeschool.com` te
autentifici ca `admin` cu parola aleasă. Sesiunile vechi s-au închis toate — seed-ul golește și
tabela lor —, deci oricine era autentificat se autentifică din nou.

## 4. Corectarea datelor

**Întâi ecranele.** Fiecare corectură de mai jos trece prin serviciul care deține rândul, deci scrie
și ce vine odată cu ea: urma în jurnal, mesajul către familie, locul eliberat oferit listei de
așteptare, starea facturii recalculată.

| Ce e greșit                                                | Unde se corectează                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Datele de contact ale unei familii                         | Profiluri → familia → Editează                                                                                           |
| Un copil trecut la familia greșită (frați pe două familii) | Copii → copilul → Editează → „Mută în altă familie"                                                                      |
| Grupa unui copil                                           | pagina copilului: transfer, închiderea înscrierii, decizia probei                                                        |
| O oră anulată, mutată sau lipsă din orar                   | Orarul: anulează, mută, reactivează, recuperează; o grupă fără ore: Grupe, sau „Generează orarul grupei" din prezența ei |
| Un marcaj de prezență greșit                               | Prezența de azi → `?zi=` ziua orei, pe telefon; sau catalogul grupei                                                     |
| Numărul de ședințe facturat unui copil                     | Emitere facturi → corectura pe copil, cât timp luna nu e emisă                                                           |
| O factură emisă cu o sumă greșită                          | Facturi → luna → factura (în modul `off`); una emisă în SmartBill se stornează acolo                                     |
| O plată trecută greșit                                     | Plăți → editează sau stornează; una înregistrată în SmartBill se stornează aici și se șterge acolo                       |
| O reducere uitată sau în plus                              | Reduceri, cât timp luna nu e facturată                                                                                   |
| Un cont blocat sau respins din greșeală                    | Conturi în așteptare → „Aprobă"; o suspendare: pagina familiei → „Ridică suspendarea"                                    |
| Un mesaj care n-a plecat                                   | Livrări spune de ce; adresa se completează în fișa familiei                                                              |

**SQL doar la urmă**, când nu există ecran. Ce ocolește: jurnalul (nu rămâne nicio urmă a cine a
schimbat), mesajele către familii, recalcularea stării facturii, oferirea locului eliberat și
câmpurile derivate — `Child.group`, de exemplu, are un singur scriitor, `EnrollmentService`. Deci:

```sh
sudo -iu deploy
set -a; . /etc/itbridge/stage.env; set +a
pg_dump -Fc "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" > ~/inainte-de-corectura.dump
psql "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
```

```sql
BEGIN;
-- corectura, cu WHERE pe id, niciodată pe nume
UPDATE ...;
-- verificarea: exact rândurile așteptate?
SELECT ...;
COMMIT;   -- sau ROLLBACK; dacă verificarea arată altceva
```

Și se notează undeva ce s-a schimbat și de ce — jurnalul platformei nu o face pentru SQL.

## 5. Ce nu e în repo

`ecosystem.config.js`, `deploy.sh`, `fetch-env.sh` și `backup.sh` stau pe instanță, în
`/srv/itbridge/`, iar valorile de mediu în Parameter Store (stage și producție separat) și în Vercel
(site-ul). Lista completă și cum se schimbă fiecare secret sunt în [secrete.md](secrete.md); pașii
producției, în [lansare-platforma.md](lansare-platforma.md).

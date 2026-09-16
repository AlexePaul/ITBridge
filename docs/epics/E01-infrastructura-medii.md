# E01 · Curățenie infrastructură și medii de rulare

**Status:** în lucru — stage rulează · **Pistă:** Fundație · **Depinde de:** — · **Blochează:** ce cere producție

## Problemă

Repo-ul descrie trei strategii de deploy moarte, suprapuse peste una reală și nedocumentată.

- `nginx/` plus `certs/` plus `HTTPS_LETSENCRYPT_SETUP.md` — reverse proxy cu Let's Encrypt legat
  de un host de DNS dinamic. `nginx.conf` face proxy către
  `https://backend:3000`, dar backend-ul servește HTTP simplu, deci configurația nu ar funcționa
  nici dacă ar fi pornită.
- `.github/workflows/aws.yml` — deploy prin SSH pe un EC2 care nu mai există, fără teste, fără
  health check, fără rollback. Face `pm2 delete` înainte de `pm2 start`, deci un build eșuat lasă
  serviciul jos.
- `it-bridge-backend/fly.toml` plus branch-ul `flyio-new-files` — o încercare de Fly.io. Calea e
  cea de atunci: directorul a devenit `apps/api/` prin [E02](E02-monorepo-tooling.md), iar fișierul
  a fost șters la S2. Rămâne scrisă așa și mai jos, în „În scop" și în S2, ca să se potrivească cu
  ce arată istoricul git.
- `greenlock-express` în `dependencies`, neimportat nicăieri în cod.

Realitatea: frontend-ul e pe Vercel, configurat din dashboard, fără `vercel.json` în repo.
Backend-ul nu e deployat nicăieri, deci site-ul funcționează ca prezentare statică.

Pe deasupra, opt branch-uri pe origin, dintre care șase moarte, și un `privkey.pem` sub `certs/` —
o cheie privată Let's Encrypt reală, validă până în ianuarie 2027, comitată la `58e2634` într-un
repo public.

Separat de curățenie, modul de rulare trebuie schimbat. Astăzi `docker-compose.yml` containerizează
backend-ul și frontend-ul cu volume montate pentru hot reload, ceea ce înseamnă un strat de
indirecție peste tot: rebuild-uri lente, `node_modules` ascuns într-un volum anonim, debugger greu
de atașat, și `API_BASE` nesetat pentru serviciul `frontend`, deci frontend-ul containerizat nici
nu vorbește cu backend-ul.

## Rezultat

Un singur drum documentat de la commit la producție, pentru fiecare componentă. Aplicația rulează
direct pe Node, local și în producție. Docker rămâne exclusiv pentru infrastructura locală.
Repo-ul nu mai conține niciun fișier de infrastructură nefolosit.

## În scop

- Ștergerea `nginx/`, `certs/`, `HTTPS_LETSENCRYPT_SETUP.md`, `.github/workflows/aws.yml`,
  `it-bridge-backend/fly.toml`, dependența `greenlock-express`.
- Rescrierea `docker-compose.yml` ca fișier de infrastructură: doar Postgres, plus ce mai apare
  ulterior de tipul ăsta.
- Provisionarea unui VPS cu Node și PM2 pentru backend, cu TLS și reverse proxy gestionate de
  gazdă sau de un Caddy minimal.
- Revocarea certificatului scurs.
- Curățarea branch-urilor moarte și rescrierea README-ului.

## În afara scopului

- Structura de monorepo, scripturile de dezvoltare și Turborepo — vezi [E02](E02-monorepo-tooling.md).
- CI de teste — vezi [E03](E03-testare-ci.md).
- Monitorizare, alertare, backup — vezi [E06](E06-observabilitate-operare.md).
- Managementul secretelor dincolo de rotația acestei chei — vezi [E07](E07-securitate-gdpr.md).

## Story-uri

### S1 · Revocarea cheii scurse — ✅ livrat

**Decizie:** fără rescriere de istoric. Certificatul acoperea un host de DNS dinamic care nu mai e
folosit; când va fi nevoie de TLS, Caddy obține certificate noi. Rescrierea istoricului ar fi rupt
toate clonele și cele nouă branch-uri remote pentru o cheie fără valoare operațională.

`certs/` e șters din branch. `certs/`, `*.pem`, `*.key` și `*.crt` sunt în `.gitignore`. Cheia e
consemnată ca **compromisă** în CLAUDE.md, secțiunea „Infrastructură — stare reală", împreună cu
motivul pentru care nu se refolosește. Hostname-ul nu mai apare nicăieri în repo.

**Rămâne de făcut, în afara repo-ului:** revocarea propriu-zisă la Let's Encrypt. Nu e blocantă —
certificatul expiră oricum în ianuarie 2027 și nu e servit de nimeni.

### S2 · Ștergerea infrastructurii moarte — ✅ livrat

Șterse: `nginx/`, `certs/`, `HTTPS_LETSENCRYPT_SETUP.md`, `it-bridge-backend/fly.toml`,
`DOCKER_SETUP.md`, ambele `Dockerfile` și `.dockerignore`-ul backend-ului. `greenlock-express` e
scos din `package.json`, iar `package-lock.json` regenerat — 203 linii de tranzitive dispărute.

**`.github/workflows/aws.yml` a fost șters, nu rescris.** Decizia din secțiunea de mai jos spune
„se rescrie", iar rescrierea _este_ S4 — făcută între timp, ca `.github/workflows/deploy.yml`. La
momentul ștergerii nu exista instanță, deci workflow-ul ar fi rulat la fiecare push pe
`release/prod`, către un host inexistent, cu `pm2 delete` înaintea lui `pm2 start`. Un workflow rupt
care se declanșează automat e mai rău decât niciunul. Destinația a rămas EC2, iar forma nouă are
`pm2 reload` și health check — plus două lucruri pe care cea veche nu le avea: niciun secret AWS
stocat și niciun port deschis.

### S3 · Docker doar pentru infrastructură — ✅ livrat

`docker-compose.yml` conține exclusiv `postgres`, cu healthcheck, volum persistent și
`restart: unless-stopped`. Cheia `version:`, obsoletă în Compose v2, a dispărut și ea.

**Verificat:** `docker compose up -d` pornește doar Postgres, `healthy` în 6 secunde. Backend-ul
pornit cu `node dist/main.js` se conectează pe `localhost:5432` și mapează toate rutele.

### S4 · Producție pe VPS cu PM2 — ✅ livrat pentru stage

Un VPS cu Node LTS, pnpm și PM2. Backend-ul rulează sub PM2 cu fișier de ecosistem versionat în
repo: nume de proces, mod cluster dacă are sens, restart pe crash, rotație de loguri, variabile de
mediu încărcate dintr-un fișier care nu e în git. TLS și reverse proxy prin Caddy, care obține și
reînnoiește certificatele singur — fără repetarea poveștii cu certbot manual.

Deploy-ul: `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, migrări, apoi
`pm2 reload` — **reload, nu delete plus start**, ca să existe repornire fără downtime și ca un
build eșuat să lase versiunea veche în funcțiune.

**Acceptanță:** un deploy cu build stricat nu întrerupe serviciul. `GET /health` public răspunde 200. Repornirea VPS-ului readuce aplicația singură, prin `pm2 startup` plus `pm2 save`.

**Stare: livrat pentru `release/stage`.** `api-stage.itbridgeschool.com` rulează pe o instanță EC2
în `eu-north-1`: Postgres 17 pe aceeași mașină, PM2 pentru proces, Caddy pentru TLS și proxy invers.
`GET /health` și `GET /ready` există. Producția n-are încă backend, și nu din lipsă de infrastructură
— vezi mai jos.

**Deploy-ul e un push pe `release/stage`.** `deploy.yml` cheamă `ci.yml` prin `workflow_call`, deci
verificările și deploy-ul sunt o singură rulare și nimic nu pleacă pe un commit roșu. Apoi:
un token OIDC schimbat pe un rol AWS de o oră, comanda trimisă prin SSM, `fetch-env.sh` ca root ca
să regenereze `/etc/itbridge/stage.env` din Parameter Store, `deploy.sh` ca `deploy` pentru install,
build, migrări și `pm2 reload`, iar la final workflow-ul cere `/ready`.

Cinci decizii care nu se citesc din cod:

- **Nicio cheie AWS în GitHub.** Rolul se asumă prin OIDC, cu trust policy limitat la
  `refs/heads/release/*`; în secrete stau doar ARN-ul rolului și id-ul instanței. SSM înseamnă că
  instanța n-are niciun port deschis pentru deploy și că nu există cheie SSH care să se scurgă.
- **`fetch-env.sh` ca root, `deploy.sh` ca `deploy`.** SSM rulează comenzile ca root; un
  `node_modules` al lui root sau un al doilea daemon PM2 ar strica fiecare deploy de după, în timp
  ce ăsta ar raporta succes. `/etc/itbridge` e 750, deci scrisul fișierului de mediu chiar cere root.
- **`deploy.sh` se oprește dacă build-ul n-a produs `apps/api/dist/main.js`.** `nest-cli.json` are
  `deleteOutDir`, deci un build întrerupt golește `dist/` fără să oprească procesul care servește
  din memorie — defecțiunea apare abia la următoarea repornire, ore mai târziu și fără legătură
  vizibilă cu deploy-ul. Acceptanța („un build stricat nu întrerupe serviciul") e respectată exact
  pentru că refuzul vine înaintea lui `pm2 reload`.
- **`instances: 1` și `exec_mode: 'fork'`.** Nu e o economie de resurse, e cerința de la
  „Scheduler-ul trebuie să ruleze într-o singură instanță": doi worker-i s-ar trezi amândoi la
  fiecare tick al outbox-ului.
- **Verificarea finală e `/ready`, nu `/health`.** `/health` spune doar că procesul trăiește;
  `/ready` atinge Postgres și S3, deci prinde un proces pornit lângă o bază la care migrarea n-a
  ajuns — singurul eșec care altfel ar trecut drept succes.

**Configurația nu e în repo și nu e în GitHub**, ci în SSM Parameter Store, de unde ajunge pe
instanță ca `/etc/itbridge/<env>.env` (640, `root:deploy`), regenerat la fiecare deploy. Din același
motiv, `ecosystem.config.js`, `deploy.sh`, `fetch-env.sh` și `backup.sh` stau în `/srv/itbridge/` pe
instanță, nu în arborele ăsta.

**Rămâne deschis: producția.** `release/prod` nu e în trigger, iar `deploy.yml` îl refuză pe nume —
branch-ul ăla poartă API-ul de dinainte de E08, zece module față de nouăsprezece, deci un deploy de
acolo ar publica altă aplicație, mai veche, nu o versiune timpurie a ăsteia. Deblocarea nu e o
sarcină de infrastructură: e decizia de a duce platforma pe `release/prod`. Mai rămân, tot în afara
repo-ului, backup-ul restaurat măcar o dată ([E04](E04-migrari-date.md), S4) și fixarea explicită a
scheduler-ului dacă instanța capătă vreodată un al doilea proces.

**Verificat:** patru deploy-uri consecutive din `deploy.yml`, fiecare terminat cu `/ready` verde pe
`api-stage.itbridgeschool.com`. Primul, pe commit-ul care a introdus workflow-ul, a picat la
asumarea rolului — trust policy-ul nu fusese încă pus pe rol. O repornire a instanței readuce
aplicația prin `pm2 startup` plus `pm2 save`.

### S5 · Vercel documentat și `API_BASE` corect

Configurația Vercel a frontend-ului e consemnată în README: comandă de build în context de
monorepo, director rădăcină, variabile. `API_BASE` e setat în Vercel și în `.env.example` local.
README-ul nu mai menționează `NUXT_PUBLIC_API_BASE`, care nu e citit de `apps/web/nuxt.config.ts`.

**Acceptanță:** login din producție funcționează capăt-la-capăt, de pe domeniul real.

**Stare: livrat în repo.** README-ul e rescris: tabel cu setările Vercel, secțiune de configurare
per componentă, `.env.example` versionat pentru ambele. Referința la `NUXT_PUBLIC_API_BASE` a
dispărut, la fel și linkul rupt către `it-bridge-backend/src/swagger.json`.

Două lucruri care au ieșit la iveală pe drum:

- **Backend-ul nu citea deloc `.env`** — fără `dotenv`, fără `ConfigModule`. Un `.env.example`
  ar fi fost decorativ. Adăugat `apps/api/src/load-env.ts`, importat primul în `main.ts`,
  care apelează `process.loadEnvFile` — built-in Node, fără dependență nouă. Ordinea contează:
  `app.module.ts` citește `process.env` la încărcare, iar în CommonJS require-urile rulează în
  ordinea din sursă.
- **`AWS_REGION` e obligatorie la boot.** `S3Service.onModuleInit` aruncă fără ea și aplicația
  nu pornește, chiar dacă nu atingi nicio factură. E acum în `.env.example` și în CLAUDE.md.

**Verificat capăt-la-capăt pe stage**, odată cu S4: `stage.itbridgeschool.com` (Vercel, de pe
`release/stage`) vorbește cu `api-stage.itbridgeschool.com`, cu `API_BASE` setat în Vercel. Pe
`itbridgeschool.com` verificarea rămâne imposibilă cât timp producția n-are backend — nu din cauza
configurației Vercel, care e aceeași.

**Verificat local:** `nuxt build` trece, `API_BASE` ajunge corect în `runtimeConfig.public.apiBase`
al bundle-ului, iar build-ul servit răspunde 200 cu `apiBase` pointat spre backend.

### S6 · Curățare de branch-uri

`backup-02-01-2026`, `backup-ui-02-01-2026`, `development`, `feature/configure-github-actions-CD`,
`feature/configure-github-actions-CD-1`, `flyio-new-files` — evaluate, apoi merge-uite sau șterse.

**Acceptanță:** `git branch -r` listează `release/prod` plus branch-urile de lucru active.

**Livrat.** Toate zece erau **complet merge-uite în branch-ul public** — zero commit-uri în plus
față de el — deci ștergerea nu a pierdut nimic: fiecare commit rămâne accesibil din istoricul lui.
Nu a fost nevoie să se merge-uiască nimic; evaluarea a fost întreaga decizie.

SHA-urile de la momentul ștergerii, ca referința să existe dacă cineva caută vreodată un branch
după nume:

| Branch                                  | HEAD      | Ultimul commit     |
| --------------------------------------- | --------- | ------------------ |
| `backup-02-01-2026`                     | `c5027b7` | 2026-01-02         |
| `backup-ui-02-01-2026`                  | `de4976c` | 2026-01-02         |
| `development`                           | `b81cbc9` | 2026-01-12         |
| `flyio-new-files`                       | `e86f4e8` | 2026-01-12         |
| `feature/docker-image-creation`         | `7703747` | 2026-01-17         |
| `feature/configure-github-actions-CD`   | `84f00d0` | 2026-01-21         |
| `feature/configure-github-actions-CD-1` | `aed01eb` | 2026-03-05         |
| `docs/onboarding-and-epics`             | `bb395e9` | 2026-08-26         |
| `feat/e01-infrastructure-cleanup`       | —         | merge-uit prin #9  |
| `feat/e02-pnpm-workspaces-turborepo`    | —         | merge-uit prin #10 |

Ultimele două nu erau în lista epicului: sunt branch-urile PR-urilor deja merge-uite, șterse din
aceeași mișcare.

## Dependențe

Niciuna. E primul epic tocmai pentru că orice altceva se deployează undeva.

## Riscuri

**PM2 pe VPS mută responsabilitatea de operare la tine.** Patch-uri de sistem, uptime, disc plin
la trei dimineața — sunt acum problema ta, nu a platformei. E o alegere legitimă, mai ieftină și
cu mai mult control, dar are un cost recurent de atenție. [E06](E06-observabilitate-operare.md)
devine obligatoriu, nu opțional, exact din motivul ăsta.

**Rescrierea istoricului rupe clonele existente.** Repo-ul are un singur autor real, deci impactul
e mic, dar trebuie anunțat înainte.

**`api.itbridgeschool.com` arată spre o mașină care nu mai e a noastră.** Descoperit pe 1 septembrie
2026, pornind de la un 404 raportat de Search Console. Faptele verificate: există un record **A**
către `51.20.70.79`, care e un IP **EC2** (AWS, zona nordică); nu răspunde nimic acolo, nici pe 80
nici pe 443; Google a primit totuși **404** de la el pe 1 iulie 2026, deci la un moment dat ceva a
răspuns; iar backend-ul nu e deployat nicăieri, deci nimic al nostru n-ar avea ce să asculte acolo.

Concluzia e un **record DNS orfan**, iar riscul lui e cel clasic de preluare de subdomeniu: IP-urile
publice EC2 se reciclează, iar cine pornește o instanță și primește exact IP-ul ăla decide ce se
servește pe un hostname care poartă numele școlii. Poate chiar obține un certificat valid pentru el,
fiindcă validarea HTTP-01 cere doar să răspunzi pe acel nume — deci un site cu lacăt, pe domeniul
școlii, către familiile care au încredere în el.

**Decizia patronului: recordul rămâne**, fiindcă subdomeniul revine oricum în ziua în care backendul
se deployează, iar ștergerea lui acum ar fi urmată de recrearea lui peste puțin timp.

Ce rămâne adevărat, ca să fie scris undeva și nu doar spus o dată: expunerea nu e **numele**, e
faptul că un record **A** arată spre un IP pe care nu-l controlăm. Numele poate sta oricât; dacă
cineva vrea și una și alta, varianta care le împacă e să rămână intenția și să plece adresa — fie
ștergând doar recordul A până la deploy, fie mutându-l pe un IP al nostru. Până atunci riscul e cel
descris mai sus și e asumat.

**Când se face S4, primul pas e să se verifice unde arată recordul înainte să fie refolosit** — nu
să se presupună că e liber. E același tipar cu cheia Let's Encrypt de mai jos: infrastructură veche,
moartă, care încă are un nume care arată spre ea.

**Postgres în producție e o decizie separată de Postgres local.** Docker local e comod. În
producție, un Postgres gestionat costă mai mult dar rezolvă backup-urile și actualizările; unul
auto-găzduit pe același VPS e mai ieftin și îți lasă ție restaurarea.

## Definition of done

Un dezvoltator nou clonează repo-ul, pornește Postgres cu o comandă, aplicația cu alta, și are
mediul complet. Un push pe `release/prod` ajunge în producție pe ambele componente, fără downtime.
Nu există în repo niciun fișier de infrastructură nefolosit.

## Decizii luate

**Backend pe AWS EC2, cu Postgres pe aceeași instanță. S3 pentru fișiere.**

Asta schimbă S2 și S4 față de forma inițială a epicului:

- **`.github/workflows/aws.yml` nu se șterge, se rescrie.** Destinația rămâne aceeași; problema
  nu a fost niciodată EC2, ci lipsa de rollback. Forma nouă: `git pull`, `pnpm install
--frozen-lockfile`, `pnpm build`, migrări, `pm2 reload`, health check. Dacă build-ul sau
  migrarea eșuează, nu se ajunge la reload și versiunea veche rămâne în funcțiune.
  _Amendament, la curățenia din S2:_ fișierul vechi a fost totuși șters, fiindcă rescrierea e
  parte din S4 și până atunci s-ar fi declanșat la fiecare push. Se scrie de la zero în S4.
- **Postgres pe instanță** înseamnă că backup-ul, restaurarea și actualizările sunt ale voastre.
  [E04](E04-migrari-date.md), S4 — proba de restaurare — devine obligatorie, nu opțională.
  Backup-urile merg în S3, unde aveți deja bucket și integrare funcțională.
- **Fără chei AWS statice.** Instanța primește un IAM instance role cu drepturi doar pe bucket-ul
  de fișiere. `AWS_ACCESS_KEY_ID` și `AWS_SECRET_ACCESS_KEY` dispar din configurație — vezi
  [E07](E07-securitate-gdpr.md), S6.
- **TLS prin Caddy** pe instanță, care obține și reînnoiește certificatele singur. Fără repetarea
  poveștii cu certbot manual din `nginx/`.
- Discul instanței devine un risc real de operare, tratat în
  [E06](E06-observabilitate-operare.md).

## Întrebări deschise

Ambele au primit răspuns.

**Rescriem istoricul git pentru cheie?** Nu. Ștergere din branch plus notă de compromitere în
CLAUDE.md — detalii în S1.

**Rămâne `itbridgeschool.com` domeniul principal?** Da, dar CORS-ul nu mai e hardcodat. Lista de
origini vine din `CORS_ORIGINS`, separată prin virgulă, cu domeniul de producție și
`http://localhost:3001` ca valori implicite când variabila lipsește. Preview-urile Vercel și un
eventual staging nu mai cer modificare de cod.

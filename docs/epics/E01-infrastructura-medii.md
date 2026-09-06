# E01 · Curățenie infrastructură și medii de rulare

**Status:** în lucru · **Pistă:** Fundație · **Depinde de:** — · **Blochează:** tot ce trebuie să ruleze undeva

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
„se rescrie", dar rescrierea _este_ S4, care nu s-a făcut încă fiindcă nu există instanță EC2.
Până atunci workflow-ul ar fi rulat la fiecare push pe ramura publică, către un host inexistent, cu
`pm2 delete` înaintea lui `pm2 start`. Un workflow rupt care se declanșează automat e mai rău
decât niciunul. Destinația rămâne EC2; S4 scrie workflow-ul de la zero, în forma cu `pm2 reload`
și health check.

### S3 · Docker doar pentru infrastructură — ✅ livrat

`docker-compose.yml` conține exclusiv `postgres`, cu healthcheck, volum persistent și
`restart: unless-stopped`. Cheia `version:`, obsoletă în Compose v2, a dispărut și ea.

**Verificat:** `docker compose up -d` pornește doar Postgres, `healthy` în 6 secunde. Backend-ul
pornit cu `node dist/main.js` se conectează pe `localhost:5432` și mapează toate rutele.

### S4 · Producție pe VPS cu PM2

Un VPS cu Node LTS, pnpm și PM2. Backend-ul rulează sub PM2 cu fișier de ecosistem versionat în
repo: nume de proces, mod cluster dacă are sens, restart pe crash, rotație de loguri, variabile de
mediu încărcate dintr-un fișier care nu e în git. TLS și reverse proxy prin Caddy, care obține și
reînnoiește certificatele singur — fără repetarea poveștii cu certbot manual.

Deploy-ul: `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, migrări, apoi
`pm2 reload` — **reload, nu delete plus start**, ca să existe repornire fără downtime și ca un
build eșuat să lase versiunea veche în funcțiune.

**Acceptanță:** un deploy cu build stricat nu întrerupe serviciul. `GET /health` public răspunde 200. Repornirea VPS-ului readuce aplicația singură, prin `pm2 startup` plus `pm2 save`.

**Stare: neînceput.** Amânat deliberat până există instanța EC2 — un `ecosystem.config.js` și un
workflow scrise împotriva unui host imaginar sunt ficțiune, nu infrastructură. Odată cu S4 intră
și `GET /health`, care astăzi nu există.

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

**Rămâne de făcut, în afara repo-ului:** setarea `API_BASE` în Vercel, pe toate mediile inclusiv
Preview. Verificarea capăt-la-capăt de pe domeniul real depinde de S4, fiindcă backend-ul nu e
încă deployat.

**Verificat local:** `nuxt build` trece, `API_BASE` ajunge corect în `runtimeConfig.public.apiBase`
al bundle-ului, iar build-ul servit răspunde 200 cu `apiBase` pointat spre backend.

### S6 · Curățare de branch-uri

`backup-02-01-2026`, `backup-ui-02-01-2026`, `development`, `feature/configure-github-actions-CD`,
`feature/configure-github-actions-CD-1`, `flyio-new-files` — evaluate, apoi merge-uite sau șterse.

**Acceptanță:** `git branch -r` listează ramura publică plus branch-urile de lucru active.

**Livrat.** Toate zece erau **complet merge-uite în ramura publică** — zero commit-uri în plus față
de ea — deci ștergerea nu a pierdut nimic: fiecare commit rămâne accesibil din istoricul ei. Nu a
fost nevoie să se merge-uiască nimic; evaluarea a fost întreaga decizie.

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
mediul complet. Un push pe `release/prod` ajunge în producție pe ambele componente, fără downtime. Nu
există în repo niciun fișier de infrastructură nefolosit.

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

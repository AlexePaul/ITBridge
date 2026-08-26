# E01 · Curățenie infrastructură și medii de rulare

**Status:** propus · **Pistă:** Fundație · **Depinde de:** — · **Blochează:** tot ce trebuie să ruleze undeva

## Problemă

Repo-ul descrie trei strategii de deploy moarte, suprapuse peste una reală și nedocumentată.

- `nginx/` plus `certs/` plus `HTTPS_LETSENCRYPT_SETUP.md` — reverse proxy cu Let's Encrypt legat
  de un host de DNS dinamic, `itbridge.webhop.me`. `nginx.conf` face proxy către
  `https://backend:3000`, dar backend-ul servește HTTP simplu, deci configurația nu ar funcționa
  nici dacă ar fi pornită.
- `.github/workflows/aws.yml` — deploy prin SSH pe un EC2 care nu mai există, fără teste, fără
  health check, fără rollback. Face `pm2 delete` înainte de `pm2 start`, deci un build eșuat lasă
  serviciul jos.
- `it-bridge-backend/fly.toml` plus branch-ul `flyio-new-files` — o încercare de Fly.io.
- `greenlock-express` în `dependencies`, neimportat nicăieri în cod.

Realitatea: frontend-ul e pe Vercel, configurat din dashboard, fără `vercel.json` în repo.
Backend-ul nu e deployat nicăieri, deci site-ul funcționează ca prezentare statică.

Pe deasupra, opt branch-uri pe origin, dintre care șase moarte, și
`certs/live/itbridge.webhop.me/privkey.pem` — o cheie privată Let's Encrypt reală, validă până în
ianuarie 2027, comitată la `58e2634` într-un repo public.

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

### S1 · Revocarea cheii scurse

Certificatul pentru `itbridge.webhop.me` e revocat la Let's Encrypt. Cheia e scoasă din istoric cu
`git filter-repo`, sau, dacă rescrierea istoricului e considerată prea invazivă, e documentată
explicit ca fiind compromisă. `certs/` și `*.pem` intră în `.gitignore`.

**Acceptanță:** `git log --all -- certs/` nu mai returnează conținut de cheie, sau există o notă
explicită de compromitere în CLAUDE.md. Domeniul `webhop.me` nu mai apare nicăieri în repo.

### S2 · Ștergerea infrastructurii moarte

Toate fișierele din "În scop" sunt șterse într-un singur commit, cu mesaj care explică de ce.
`greenlock-express` dispare din `package.json`.

**Acceptanță:** o căutare după `nginx`, `certbot`, `greenlock`, `fly` sau `pm2 delete` în repo nu
mai returnează configurație activă.

### S3 · Docker doar pentru infrastructură

`docker-compose.yml` păstrează exclusiv serviciul `postgres`, cu healthcheck și volum persistent.
Serviciile `backend`, `frontend` și `nginx` dispar, împreună cu `it-bridge-backend/Dockerfile` și
`it-bridge-frontend/Dockerfile`.

**Acceptanță:** `docker compose up -d` pornește doar Postgres. Aplicația se pornește separat, cu
comenzile din [E02](E02-monorepo-tooling.md), și se conectează la el pe `localhost:5432`.

### S4 · Producție pe VPS cu PM2

Un VPS cu Node LTS, pnpm și PM2. Backend-ul rulează sub PM2 cu fișier de ecosistem versionat în
repo: nume de proces, mod cluster dacă are sens, restart pe crash, rotație de loguri, variabile de
mediu încărcate dintr-un fișier care nu e în git. TLS și reverse proxy prin Caddy, care obține și
reînnoiește certificatele singur — fără repetarea poveștii cu certbot manual.

Deploy-ul: `git pull`, `pnpm install --frozen-lockfile`, `pnpm build`, migrări, apoi
`pm2 reload` — **reload, nu delete plus start**, ca să existe repornire fără downtime și ca un
build eșuat să lase versiunea veche în funcțiune.

**Acceptanță:** un deploy cu build stricat nu întrerupe serviciul. `GET /health` public răspunde
200. Repornirea VPS-ului readuce aplicația singură, prin `pm2 startup` plus `pm2 save`.

### S5 · Vercel documentat și `API_BASE` corect

Configurația Vercel a frontend-ului e consemnată în README: comandă de build în context de
monorepo, director rădăcină, variabile. `API_BASE` e setat în Vercel și în `.env.example` local.
README-ul nu mai menționează `NUXT_PUBLIC_API_BASE`, care nu e citit de `nuxt.config.ts`.

**Acceptanță:** login din producție funcționează capăt-la-capăt, de pe domeniul real.

### S6 · Curățare de branch-uri

`backup-02-01-2026`, `backup-ui-02-01-2026`, `development`, `feature/configure-github-actions-CD`,
`feature/configure-github-actions-CD-1`, `flyio-new-files` — evaluate, apoi merge-uite sau șterse.

**Acceptanță:** `git branch -r` listează `main` plus branch-urile de lucru active.

## Dependențe

Niciuna. E primul epic tocmai pentru că orice altceva se deployează undeva.

## Riscuri

**PM2 pe VPS mută responsabilitatea de operare la tine.** Patch-uri de sistem, uptime, disc plin
la trei dimineața — sunt acum problema ta, nu a platformei. E o alegere legitimă, mai ieftină și
cu mai mult control, dar are un cost recurent de atenție. [E06](E06-observabilitate-operare.md)
devine obligatoriu, nu opțional, exact din motivul ăsta.

**Rescrierea istoricului rupe clonele existente.** Repo-ul are un singur autor real, deci impactul
e mic, dar trebuie anunțat înainte.

**Postgres în producție e o decizie separată de Postgres local.** Docker local e comod. În
producție, un Postgres gestionat costă mai mult dar rezolvă backup-urile și actualizările; unul
auto-găzduit pe același VPS e mai ieftin și îți lasă ție restaurarea.

## Definition of done

Un dezvoltator nou clonează repo-ul, pornește Postgres cu o comandă, aplicația cu alta, și are
mediul complet. Un push pe `main` ajunge în producție pe ambele componente, fără downtime. Nu
există în repo niciun fișier de infrastructură nefolosit.

## Decizii luate

**Backend pe AWS EC2, cu Postgres pe aceeași instanță. S3 pentru fișiere.**

Asta schimbă S2 și S4 față de forma inițială a epicului:

- **`.github/workflows/aws.yml` nu se șterge, se rescrie.** Destinația rămâne aceeași; problema
  nu a fost niciodată EC2, ci lipsa de rollback. Forma nouă: `git pull`, `pnpm install
  --frozen-lockfile`, `pnpm build`, migrări, `pm2 reload`, health check. Dacă build-ul sau
  migrarea eșuează, nu se ajunge la reload și versiunea veche rămâne în funcțiune.
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

- Rescriem istoricul git pentru cheie, sau doar revocăm și documentăm?
- Rămâne `itbridgeschool.com` domeniul principal? CORS-ul din `main.ts` e hardcodat pe el.

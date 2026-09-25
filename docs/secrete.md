# Secretele platformei

Unde stă fiecare secret, ce se strică dacă scapă și cum se schimbă — [E07](epics/E07-securitate-gdpr.md)
S6. Niciunul nu stă în repo: `pnpm secrets` caută chei, tokenuri și chei private în tot ce e urmărit
de git, iar CI rulează aceeași comandă la fiecare PR.

## Regula

**Un secret stă într-un singur loc, iar locul depinde de cine îl citește:**

| Cine citește             | Unde stă                                             | Cum ajunge acolo                                                                            |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| API-ul de pe stage (EC2) | **SSM Parameter Store**                              | `fetch-env.sh` regenerează `/etc/itbridge/stage.env` la fiecare deploy (640, `root:deploy`) |
| Site-ul (Vercel)         | **Environment Variables** din proiectul Vercel       | la următorul build; pe Production **și** pe Preview                                         |
| GitHub Actions           | nimic secret                                         | un rol AWS de o oră, prin OIDC; în GitHub stau doar ARN-ul rolului și id-ul instanței       |
| Agentul din birou        | fișierul de configurare de pe calculatorul din birou | vezi [apps/agent/README.md](../apps/agent/README.md)                                        |
| Un laptop                | `.env` de la rădăcină                                | copiat din `.env.example`, care are **valori goale** la fiecare secret                      |

`.env.example` păstrează doar două feluri de valori: cele care nu sunt secrete (porturi, adrese
locale) și credențialele de unică folosință ale Postgres-ului și MinIO-ului din `docker-compose.yml`
(`dev_password`), fără de care `docker compose up -d` n-ar porni. Niciuna nu deschide ceva în afara
laptopului.

**Pe EC2 nu există cheie AWS.** Accesul la S3 e rolul instanței, iar SDK-ul îl găsește singur când
`AWS_ACCESS_KEY_ID` lipsește. Dacă apare totuși o pereche statică îndreptată spre AWS — fără
`AWS_S3_ENDPOINT` —, backend-ul o spune la pornire, în logul pe care îl citește un deploy:
`A static AWS key pair is configured against AWS itself`. Cheia se scoate din Parameter Store și se
dezactivează în IAM.

## Fiecare secret

**`JWT_ACCESS_TOKEN_SECRET` și `JWT_REFRESH_TOKEN_SECRET`** — semnează tokenurile de acces (15
minute) și de reîmprospătare (7 zile). **Periculos e primul**: `AuthGuard` verifică doar semnătura,
deci cine îl are poate emite un token de acces pentru orice cont, adminii inclusiv. Al doilea singur
nu ajunge — un token de reîmprospătare e primit doar dacă hash-ul lui există în `sessions`. Backend-ul
refuză să pornească dacă au sub 16 caractere, dacă sunt egale sau dacă sunt implicitele vechi
(`env.validation.ts`). Se generează cu `openssl rand -base64 48`, câte unul nou pentru fiecare.

- Schimbat **primul**, nu observă nimeni: tokenul de acces vechi primește 401, `useApi`
  reîmprospătează cu tokenul de reîmprospătare, care e încă bun, și continuă. Deci rotirea lui nu
  costă nimic — și e primul lucru de făcut dacă a scăpat.
- Schimbat **al doilea**, toată lumea se autentifică din nou — inclusiv agentul din birou, care o
  face singur.

**`DB_PASSWORD`** — parola rolului Postgres al aplicației, pe aceeași mașină. Se schimbă întâi în
baza de date (`ALTER ROLE … PASSWORD …`), apoi în Parameter Store, apoi un deploy. Între cele două
aplicația nu se mai poate conecta, deci se face dintr-o dată; `/ready` spune dacă a mers. Backup-ul
de la 03:15 (`backup.sh`, pe instanță) citește aceeași configurație — de verificat acolo, fiindcă
fișierul nu e în repo.

**`MAIL_RESEND_API_KEY`** — trimite mailurile către familii, în numele domeniului școlii. Se creează
o cheie nouă în Resend, cu drept doar de trimitere, se pune în Parameter Store, deploy, apoi se
șterge cea veche. Fereastra în care cheia lipsește sau e greșită nu pierde nimic: mesajele rămân în
`outbox`, iar un eșec de configurare nu consumă încercări (E17 S3).

**`RESEND_API_KEY`** — a formularului public de contact, **separată** de cea de mai sus (E17), ca o
rafală pe formular să nu consume cota mesajelor către părinți. Stă în Vercel, pe Production și pe
Preview; se schimbă acolo și se face un redeploy al site-ului.

**`SMARTBILL_TOKEN`** (cu `SMARTBILL_USERNAME`) — emite facturi fiscale reale; SmartBill n-are
sandbox. Tokenul nou se ia din SmartBill Cloud, se pune în Parameter Store, deploy. Cât timp e
greșit, SmartBill răspunde 401 și coada așteaptă fără să consume încercări (E16 S2), deci nicio
factură nu se pierde și niciuna nu pleacă de două ori.

**`ITBRIDGE_AGENT_PASSWORD`** — contul cu care agentul din birou urcă lucrările copiilor. Se schimbă
parola contului — autentificat ca el, din schimbarea de parolă, care revocă și sesiunile lui — și în
configurația agentului, apoi se repornește serviciul Windows.
Până atunci agentul nu poate urca, iar fișierele așteaptă pe partajare — partajarea _e_ coada.

**`SEED_PASSWORD`** — doar pentru `pnpm seed:stage`, în `.env.stage` de pe laptopul celui care îl
rulează; nu ajunge niciodată pe instanță. E parola contului de admin pe care seed-ul îl scrie pe
stage.

## Dacă a scăpat unul

1. Se rotește **acum**, după pașii de mai sus — înainte de orice altceva.
2. Dacă a ajuns într-un commit, istoricul **nu** se rescrie: se tratează ca public, pentru totdeauna,
   exact ca cheia Let's Encrypt de la `58e2634` (vezi CLAUDE.md). O rescriere de istoric ar lăsa
   copia în fiecare clonă și fork, iar senzația că s-a rezolvat ar fi mai periculoasă decât lipsa ei.
3. Pentru secretul tokenurilor de acces și pentru parola bazei, se citește jurnalul de audit
   (`GET /audit`) pe perioada în care au fost expuse: orice scriere pe bani, pe date personale sau pe
   accesul cuiva lasă acolo un rând cu cine a făcut-o.

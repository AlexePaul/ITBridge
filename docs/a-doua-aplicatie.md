# A doua aplicație pe aceeași instanță

Ghid pentru cine pune o a doua aplicație pe instanța care rulează `api-stage.itbridgeschool.com` și
pe aceeași stocare S3. Jumătate din el e ce trebuie să **nu** faci, fiindcă fiecare punct de mai jos
e un loc în care un deploy al aplicației noi oprește aplicația veche fără să-și dea seama nimeni.

Pentru context, citește întâi „Infrastructură — stare reală" din [CLAUDE.md](../CLAUDE.md) și
[runbook.md](runbook.md), secțiunile 1 și 3.3. Id-ul instanței, id-ul contului AWS și valorile de
mediu **nu sunt în acest repo și nu trebuie scrise în el** — repo-ul e public. Stau în secretele din
GitHub și în Parameter Store; vezi [secrete.md](secrete.md).

## Ce e deja acolo

| Ce                                                              | Unde                                                     | Cine îl deține                 |
| --------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Clona ITBridge                                                  | `/srv/itbridge/stage`                                    | userul `admin`                 |
| `deploy.sh`, `fetch-env.sh`, `ecosystem.config.js`, `backup.sh` | `/srv/itbridge/`                                         | nu sunt în repo                |
| Variabilele de mediu                                            | `/etc/itbridge/stage.env` (640, `root:admin`)            | regenerat la fiecare deploy    |
| Sursa lor                                                       | SSM Parameter Store, prefixul `/itbridge/stage/`         | —                              |
| Procesul                                                        | PM2, sub `admin`, `instances: 1`, `exec_mode: fork`      | —                              |
| Portul                                                          | **3100**, pe `127.0.0.1`                                 | —                              |
| Postgres                                                        | 17, pe aceeași mașină, `localhost`                       | —                              |
| TLS și proxy                                                    | Caddy, configurat pe instanță                            | nu e în repo                   |
| Acces                                                           | AWS Systems Manager; **nu există SSH și nu există chei** | —                              |
| Deploy                                                          | GitHub Actions → OIDC → rol de o oră → SSM Send-Command  | `.github/workflows/deploy.yml` |
| Backup                                                          | `pg_dump` zilnic la 03:15 către S3                       | `backup.sh`, pe instanță       |

Fusul aplicației e `Europe/Bucharest` și nu e o preferință: toate comparațiile de ore din ITBridge
sunt pe ceasul școlii. Dacă aplicația nouă are orare, citește „Orele se compară ca text" din
CLAUDE.md înainte să scrii prima comparație de dată.

## Cele șapte coliziuni

**1. Portul.** 3100 e luat. Alege-ți altul, scrie-l în runbook-ul tău și **nu-l lăsa doar în
`ecosystem.config.js`**: în sesiunea din 11 noiembrie 2026 portul stage-ului nu era scris nicăieri,
singurul număr documentat era 3000 (dezvoltarea locală), iar un `curl` pe 3000 răspunde „Could not
connect" și arată exact ca un proces căzut. A costat o oră. Caddy rutează pe hostname, deci îi
adaugi un nume și îl trimiți la `127.0.0.1:<portul tău>` — `127.0.0.1`, nu `localhost`, fiindcă
numele se rezolvă întâi la `::1` iar aplicația ascultă pe IPv4.

**2. PM2 e un daemon pe utilizator, nu pe aplicație.** Dacă rulezi și tu ca `admin` — și e bine, un
`pm2 ls` care arată amândouă aplicațiile e exact ce vrei când depanezi —, atunci:

- `deploy.sh` al tău atinge **numai numele tău de proces**: `pm2 reload <numele-tău>`. Un
  `pm2 reload all`, `pm2 restart all`, `pm2 delete all` sau `pm2 kill` repornește sau omoară și
  ITBridge, iar deploy-ul tău raportează succes.
- `pm2 save` scrie un singur `dump.pm2` pentru utilizator, deci salvează **amândouă** aplicațiile.
  Rulează-l după ce ambele sunt online, niciodată cu a celuilalt oprită — altfel la următorul reboot
  revine doar a ta.
- `max_memory_restart` per aplicație, fiindcă o scurgere de memorie a uneia duce OOM killer-ul peste
  cealaltă. Pe instanța asta **swap-ul e 0**, deci nu există tampon.
- Dacă aplicația ta are job-uri programate, `instances: 1` și `exec_mode: 'fork'` sunt obligatorii
  din același motiv ca la ITBridge: doi worker-i se trezesc amândoi la fiecare tick.

**3. Postgres e aceeași instanță.** Îți faci **baza ta și rolul tău**, iar rolul tău nu primește
niciun drept pe baza ITBridge. Nu e eleganță: ITBridge are un script de seed care golește tabelele,
iar singurul lucru care-l ține departe de o bază greșită e o regulă care compară
`SEED_ALLOW_NON_LOCAL` cu `DB_NAME`. Un rol fără drepturi încrucișate e apărarea care nu depinde de
corectitudinea scriptului celuilalt. Două lucruri în plus:

- `max_connections` e partajat (implicit 100). Două pool-uri de TypeORM pe o instanță mică le
  consumă repede; pune o limită explicită pe pool-ul tău.
- `backup.sh` face `pg_dump` pe bazele pe care le cunoaște. **Baza ta nu e salvată până nu o adaugi
  acolo**, iar fișierul nu e în niciun repo — stă în `/srv/itbridge/`. Verifică backup-ul tău
  restaurându-l o dată, nu citind scriptul.

**4. Stocarea S3, și aici e o problemă pe care prefixele nu o rezolvă.** ITBridge ține în bucket
facturile familiilor (`invoices/`) și lucrările copiilor (`projects/`), cheile derivate din
id-uri. Partea ușoară e că îți iei propriul prefix.

Partea care nu se rezolvă cu un prefix: **amândouă aplicațiile rulează pe aceeași instanță, deci
folosesc același instance role.** IAM nu le poate deosebi. Orice drept pe bucket pe care îl are una
îl are și cealaltă, iar un bug în derivarea cheilor tale citește facturile unei familii. Separarea
prin prefix e o convenție, nu o graniță.

Deci: **ia-ți bucket propriu.** Instance role-ul primește drepturi pe amândouă, dar o greșeală de
cheie în aplicația ta lovește bucket-ul tău. Dacă bucket-ul trebuie să fie același, scrie în
documentația ta că aplicația ta poate citi datele personale ale familiilor ITBridge și tratează-o ca
pe un sistem care le prelucrează — inclusiv în inventarul de date, dacă intri sub GDPR.

**5. Secretele: prefixul tău în Parameter Store, și `fetch-env.sh` al tău.** `/itbridge/stage/` e
luat; tu iei `/<numele-tău>/<mediu>/`. `fetch-env.sh` interoghează un **prefix**, nu o listă de
chei, deci copia ta diferă doar prin prefix și prin fișierul pe care-l scrie
(`/etc/<numele-tău>/<mediu>.env`, 640, `root:admin`). Nu scrie în `/etc/itbridge/` și nu citi de
acolo. Rolul de deploy al tău primește `ssm:GetParametersByPath` **numai pe prefixul tău**.

Pe laptop, editarea în masă e `pnpm secrets:edit` din ITBridge (`scripts/secrets.mjs`), care ia
prefixul din `ITBRIDGE_SSM_PREFIX` — deci merge și pe al tău, fără să copiezi scriptul. E în Node, nu
în bash, și motivul e scris în [secrete.md](secrete.md): pe Windows, bash plus AWS CLI plus jq pe
același PATH sunt trei probleme în loc de una.

**6. Rolul de deploy e al unui singur repo, și nu se lărgește.** Trust policy-ul rolului ITBridge e
limitat la `repo:AlexePaul/ITBridge:ref:refs/heads/release/*`. **Nu-l extinde cu repo-ul tău**: ar
însemna că un workflow din repo-ul tău poate deploya ITBridge. Îți faci rol propriu, cu trust
policy-ul tău.

Și aici e al doilea lucru care nu se rezolvă prin IAM obișnuit: deploy-ul merge prin
`AWS-RunShellScript`, adică **orice comandă, ca root, pe instanță**. Două aplicații care se
deployează așa înseamnă că workflow-ul fiecăreia poate citi fișierul de mediu al celeilalte — cu
toate secretele în el. Dacă asta contează, soluția e un **document SSM propriu** care rulează exact
`/srv/<numele-tău>/deploy.sh` fără comenzi libere, iar rolul tău primește `ssm:SendCommand` numai pe
documentul ăla. E singura separare reală pe o instanță partajată.

**7. Discul e fix și partajat.** Două checkout-uri, două `node_modules`, două `dist/`, datele
Postgres și logurile PM2. Depozitul pnpm e pe utilizator, deci dacă rulezi tot ca `admin` îl
împărțiți — asta economisește spațiu, nu îl consumă. `pm2-logrotate` e un modul al daemonului, deci
îți acoperă și logurile tale fără să configurezi nimic. Ce poate fi șters la înghesuială e în
[runbook.md](runbook.md), 3.5.

## Patru lecții deja plătite

Le scriu aici ca să nu le plătești a doua oară.

**Un guard care refuză pornirea e o pană, nu un deploy oprit.** `pm2 reload` oprește procesul vechi
înainte ca cel nou să apuce să refuze, deci o verificare de configurație care aruncă la boot lasă
aplicația jos. ITBridge a stat așa după PR-ul #281. Remediul e o linie în `deploy.sh`, **înaintea**
lui `pm2 reload`, care trece fișierul de mediu prin aceeași validare pe care o face aplicația, cu
build-ul nou; forma exactă e în [lansare-platforma.md](lansare-platforma.md), pasul 6. Cu ea,
deploy-ul se oprește și versiunea veche servește mai departe.

**`export CI=true` sus în `deploy.sh`.** O comandă trimisă prin SSM n-are terminal, iar `pnpm
install` poate cere o confirmare — ștergerea lui `node_modules`, când store-ul s-a mutat — pe care
n-o primește niciodată: `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, deploy oprit înainte de build.

**`deploy.sh` nu rulează ca root**, chiar dacă SSM îl pornește ca root: un `node_modules` al lui root
sau un al doilea daemon PM2 sub root strică fiecare deploy de după, în timp ce cel care a făcut-o
raportează succes. Ce contează e că nu e root, nu care user e.

**Oprește-te dacă build-ul n-a produs artefactul.** La ITBridge, `nest build` golește `dist/` la
început, deci un build întrerupt lasă procesul viu servind din memorie și rupe abia la următoarea
repornire — adică la ore sau zile după cauza lui. `deploy.sh` verifică explicit că fișierul de
intrare există înainte de `pm2 reload`.

## Checklist de pornire

1. Port ales și scris în documentația ta; hostname în Caddy către `127.0.0.1:<port>`.
2. Bază și rol Postgres proprii, fără drepturi pe baza ITBridge; pool cu limită explicită.
3. Bucket S3 propriu (sau decizia conștientă de a împărți, scrisă).
4. Prefix propriu în Parameter Store; `fetch-env.sh` propriu, scriind în `/etc/<app>/<mediu>.env`.
5. Rol OIDC propriu, trust policy pe repo-ul tău; ideal, document SSM propriu fără comenzi libere.
6. `deploy.sh`: `export CI=true`, rulat ca utilizator non-root, verificarea artefactului,
   pre-validarea fișierului de mediu, `pm2 reload <numele-tău>` — niciodată `all`.
7. `/health` și `/ready` proprii, iar workflow-ul tău verifică `/ready` la final, nu `/health`.
8. `pm2 save` cu amândouă aplicațiile online; `pm2 startup` activat; **testează un reboot**.
9. Baza ta adăugată în `backup.sh`, și un restore de probă.
10. `max_memory_restart` pe amândouă, și pune swap pe instanță — azi e 0.

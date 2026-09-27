# Lansarea platformei — ce se completează la final

Tot ce se putea construi fără conturile școlii e construit și rulează pe `release/stage`
(`stage.itbridgeschool.com`, `api-stage.itbridgeschool.com`). Pagina asta e lista, în ordine, a ce
rămâne: **conturile și valorile școlii** și câteva comenzi. Nu mai e nimic de programat.

Situația de azi: în producție rulează doar site-ul public (`release/prod` pe Vercel), fără API —
vezi CLAUDE.md, „Cele două branch-uri". Lansarea platformei înseamnă că `release/prod` devine
platforma întreagă.

## 1. Ce trebuie adus

Fiecare valoare stă într-un singur loc (vezi [secrete.md](secrete.md)): pentru API, în **SSM
Parameter Store**, de unde `fetch-env.sh prod` scrie `/etc/itbridge/prod.env` la fiecare deploy;
pentru site, în **Vercel**, la Production.

| Ce                       | Variabile                                                                                                        | De unde                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SmartBill**            | `SMARTBILL_USERNAME`, `SMARTBILL_TOKEN`, `SMARTBILL_CIF`, `SMARTBILL_INVOICE_SERIES`, `SMARTBILL_RECEIPT_SERIES` | SmartBill Cloud → Contul Meu → Integrări → API. Seriile, **create doar pentru platformă** — nimeni nu emite de mână pe ele                                                    |
|                          | `SMARTBILL_TAX_NAME` + `SMARTBILL_TAX_PERCENTAGE`                                                                | doar dacă școala e plătitoare de TVA; numele exact din `pnpm smartbill:check`                                                                                                 |
|                          | `SMARTBILL_MODE=live`, `SMARTBILL_LIVE_DB=<DB_NAME>`                                                             | pornește doar cu `NODE_ENV=production` și cu numele bazei repetat — a doua cheie a ușii                                                                                       |
| **Email (Resend)**       | `MAIL_RESEND_API_KEY`, `MAIL_FROM`                                                                               | Resend: domeniul `itbridgeschool.com` verificat (SPF, DKIM, DMARC în DNS), o cheie doar de trimitere; `MAIL_FROM` de forma `IT Bridge School <notificari@itbridgeschool.com>` |
|                          | `MAIL_OFFICE_ADDRESS`                                                                                            | căsuța biroului, pentru mementouri și semnale                                                                                                                                 |
|                          | Vercel: `RESEND_API_KEY`, `CONTACT_FROM`                                                                         | formularul de contact, cu **altă** cheie                                                                                                                                      |
| **Școala pe hârtie**     | `SCHOOL_LEGAL_NAME`, `SCHOOL_CUI`, `SCHOOL_REG_COM`, `SCHOOL_SEAT`, `SCHOOL_IBAN`, `SCHOOL_BANK`                 | actele firmei și banca. IBAN-ul se verifică la pornire cifră cu cifră; apar în portal, pe emailul facturii și pe PDF                                                          |
| **Textele juridice**     | locurile marcate `[[…]]` din [legal/](legal/README.md)                                                           | aceleași fapte ca rândul de mai sus, plus deciziile din README; apoi avocatul                                                                                                 |
| **AWS**                  | `AWS_REGION`, `AWS_S3_BUCKET`                                                                                    | un bucket al producției; accesul e rolul instanței, **fără** chei statice                                                                                                     |
|                          | GitHub: secretul `EC2_INSTANCE_ID_PROD`, variabila `PROD_API_DEPLOY=enabled`                                     | instanța producției (poate fi aceeași mașină ca stage, cu alt proces PM2 și altă bază); rolul din `AWS_DEPLOY_ROLE_ARN` trebuie să aibă `ssm:SendCommand` și pe ea            |
| **Secretele aplicației** | `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, `DB_PASSWORD`                                             | `openssl rand -base64 48`, câte unul **nou** pentru producție — niciodată cele de pe stage                                                                                    |
| **Mediul**               | `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME`, `CORS_ORIGINS=https://itbridgeschool.com`     | `SITE_URL` rămâne **nesetată** (implicitul e domeniul real)                                                                                                                   |
| **Site-ul**              | Vercel, Production: `API_BASE=https://api.itbridgeschool.com`                                                    | apoi un redeploy                                                                                                                                                              |
| **DNS și TLS**           | `api.itbridgeschool.com` → instanța; blocul lui în Caddy                                                         | Caddy obține singur certificatul                                                                                                                                              |
| **Agentul din birou**    | `config.json` al agentului: adresa API de producție, utilizatorul și parola lui                                  | [apps/agent/README.md](../apps/agent/README.md)                                                                                                                               |

**Ce refuză singur să pornească**, ca să nu se descopere lipsa de la un părinte: un backend cu
`NODE_ENV=production` fără `MAIL_RESEND_API_KEY`, `MAIL_FROM` sau `AWS_S3_BUCKET`; un IBAN cu o cifră
greșită sau fără beneficiar; `SMARTBILL_MODE=live` fără serii, fără `SMARTBILL_LIVE_DB` sau în afara
producției; secretele JWT scurte, egale sau implicite. Mesajul numește variabila.

## 2. Ordinea

1. **Textele juridice.** Se completează `[[…]]`, le citește avocatul, se publică versiunea finală și se
   urcă `LEGAL_DOCUMENT_VERSIONS` după procedura din `legal-documents.ts`. Familiile acceptă la
   înregistrare exact ce e publicat.
2. **SmartBill, fără nicio factură.** Cu valorile din tabel într-un `.env` local:
   `pnpm smartbill:check` (doar citește — cote TVA, serii), apoi `pnpm smartbill:check --draft` și
   `--draft --receipt`: câte o ciornă, fără număr, care se citește în SmartBill Cloud și se șterge.
3. **Resend.** Domeniul verificat; un mail de probă trimis din Resend către o adresă a școlii.
4. **Parameter Store** — valorile din tabel, pentru producție; **Vercel** — `API_BASE`,
   `RESEND_API_KEY`, `CONTACT_FROM`.
5. **Platforma trece pe `release/prod`**, o dată: un merge din `release/stage`. De atunci
   `release/prod` nu mai e „doar site-ul public" — CLAUDE.md se actualizează în același pas —, iar un
   push acolo e un deploy, ca pe stage.
6. **Deploy-ul producției.** Secretul `EC2_INSTANCE_ID_PROD`, apoi variabila `PROD_API_DEPLOY=enabled`
   (Settings → Secrets and variables → Actions). Primul push pe `release/prod` rulează CI-ul, migrările
   și `pm2 reload`, și verifică `https://api.itbridgeschool.com/ready`. Pe instanță trebuie să existe
   `prod` în `fetch-env.sh`, `deploy.sh` și `ecosystem.config.js` — fișierele stau acolo, nu în repo.
7. **Primul admin**, pe instanță, într-un terminal:
   `pnpm --filter api admin:create --username <nume>`. Cere parola de două ori, fără ecou (minim 12
   caractere). Nu șterge nimic; seed-ul, în schimb, **refuză** o bază de producție. Aceeași comandă cu
   `--reset-password` e singura cale înapoi pentru un admin care și-a uitat parola.
8. **Școala în platformă**, din ecranele de admin: locațiile și sălile, grupele, calendarul școlar
   (vacanțe, sărbători), apoi familiile — cele care au sunat se trec de la birou și primesc linkul de
   cont.
9. **Agentul din birou**, repornit cu adresa producției.

## 3. După prima lună

- Prima emitere, după ce luna s-a predat: `/admin/invoices/emitere`. Cu `live`, facturile pleacă în
  SmartBill în câteva minute, iar familiile primesc emailul când factura are număr.
- Primul extras de bancă (CSV) importat în `/admin/reconciliere`: parserul citește capul de tabel, nu o
  bancă anume, dar primul extras real e prima verificare pe formatul băncii școlii.
- `/admin/livrari` și tabloul de bord arată dacă a rămas vreun mesaj nelivrat sau blocat — și cui:
  un mesaj fără adresă numește familia, de obicei una trecută de la telefon fără email. Adresa se
  completează în fișa familiei.

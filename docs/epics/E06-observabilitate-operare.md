# E06 · Observabilitate și operare

**Status:** scos din MVP, cu **S1 livrat în formă restrânsă** (jurnalul de erori din aplicație) și
**S5 scris** ([runbook.md](../runbook.md)), 27 septembrie 2026 · **Pistă:** Fundație · **Depinde de:** E01, E05 · **Blochează:** alertarea
din [E14](E14-proiecte-elevi.md) S2, și nimic altceva — [E17](E17-comunicare-notificari.md) nu mai
are story-uri deschise

> **Scos din MVP prin decizie (septembrie 2026).** Observabilitatea din prima zi de producție e PM2,
> atât: `pm2 logs` și `pm2 monit` pe instanța din [E01](E01-infrastructura-medii.md) S4, citite de
> omul care a făcut deploy-ul. Fără Sentry, fără agregare, fără verificare externă de uptime — la o
> școală cu două adrese și un singur om tehnic, un al doilea sistem de urmărit e el însuși o
> cheltuială de operare.
>
> Din problema de mai jos rămâne o singură bucată adevărată, și e singura care se strică singură:
> **logurile PM2 cresc până umplu partiția.** Rotația se pune odată cu procesul, în E01 S4, ca linie
> de configurare — nu ca story aici.
>
> Ce se pierde, spus acum ca să nu fie descoperit mai târziu: o excepție în producție se află de la
> părintele care sună, iar pulsul agentului din [E14](E14-proiecte-elevi.md) S2 se vede pe ecran fără
> să alerteze pe nimeni. Epicul se reia când prima cădere e găsită de altcineva înaintea voastră —
> ăla e semnalul, nu o dată din calendar.
>
> **Revizuit pe 27 septembrie 2026, înaintea testării integrale:** prima jumătate a propoziției de
> mai sus nu mai e adevărată. S1 s-a livrat fără Sentry și fără un al doilea sistem de urmărit —
> vezi S1 mai jos: erorile stau în baza platformei și se citesc pe `/admin/erori`. Motivul e cel
> pentru care se testează: cine găsește un bug trebuie să-l poată urmări până la linia de cod fără
> acces la instanță. Restul epicului rămâne scos.

## Problemă

Nu există niciun mod de a ști dacă platforma funcționează, în afară de a o deschide și a încerca.

Nu există raportare de erori, deci o excepție în producție e văzută doar dacă un părinte sună.
Nu există agregare de loguri: cu PM2 pe VPS, logurile sunt fișiere pe disc, care cresc până umplu
partiția. Nu există verificare de uptime, nici alertare, nici măsurare de performanță. Nu există
runbook — dacă cade ceva la ora 19:00, în plin curs, nimeni nu are o listă de pași.

Decizia din [E01](E01-infrastructura-medii.md) de a rula pe VPS cu PM2 mută responsabilitatea de
operare la voi. E o alegere legitimă, dar transformă acest epic din opțional în obligatoriu.

## Rezultat

Când ceva se strică, afli înainte să-ți spună un părinte, și ai unde să te uiți.

## În scop

- Raportare de erori cu context, pe backend și frontend.
- Loguri agregate, căutabile, cu rotație.
- Verificare de uptime cu alertare.
- Metrici de bază: latență, rată de eroare, dimensiunea pool-ului de conexiuni.
- Runbook pentru incidentele previzibile.
- Bugetare de performanță pe fluxurile critice.

## În afara scopului

- Analytics de business — vezi [E21](E21-raportare-analytics.md). Sunt lucruri diferite: aici e
  vorba de sănătatea sistemului, acolo de sănătatea școlii.

## Story-uri

### S1 · Raportare de erori

Sentry sau echivalent, pe backend și pe frontend, cu id-ul de corelare din
[E05](E05-robustete-backend.md) atașat, cu versiunea deployată și cu source maps încărcate. Datele
personale sunt filtrate înainte de trimitere.

**Acceptanță:** o excepție aruncată deliberat în producție apare în consolă în sub un minut, cu
stack trace citibil și cu id-ul de corelare.

> **Livrat în formă restrânsă (27 septembrie 2026), fără serviciu extern.** Consola e
> `/admin/erori`, în meniul adminului („Sistem"), cu cifra erorilor nerezolvate lângă ea. Intră
> acolo trei feluri de erori, un rând pe **defect**, nu pe apariție: fiecare răspuns 5xx (ruta,
> contul, codul cererii), fiecare linie scrisă la nivel `error` pe server (joburile, coada de
> emailuri, SmartBill — fără să le lege cineva, prin loggerul aplicației) și fiecare ecran stricat
> în browserul cuiva autentificat. **Id-ul de corelare e codul de pe ecran**: un 500 spune „A apărut
> o eroare pe server… (cod 3f2a9c1d)", un ecran stricat arată un toast cu codul lui, iar codul tastat
> pe `/admin/erori` găsește rândul, cu stack trace-ul pe liniile din `.ts` (hărțile sursă sunt
> pornite). **Datele personale sunt filtrate înainte de scriere** — adrese, telefoane, IBAN-uri,
> tokenuri, valorile citate de Postgres —, contul e un id, iar rândul pleacă la 30 de zile după
> ultima apariție, ca logurile tehnice din nota de confidențialitate.
>
> Ce **nu** s-a făcut din story: versiunea deployată pe rând și hărțile sursă ale frontend-ului —
> stack-ul unei erori din browser arată fișierele construite, deci acolo se caută după mesaj și
> componentă. Și nicio alertare: rândul așteaptă să-l deschidă cineva, iar cifra din meniu e tot ce
> atrage atenția (S3 rămâne scos). Detaliile sunt în CLAUDE.md, la „O eroare lasă un rând".

### S2 · Loguri agregate

Logurile PM2 se trimit către un serviciu de agregare, cu retenție de 30 de zile și rotație locală
ca să nu umple discul. Căutare după id de corelare, utilizator sau rută.

**Acceptanță:** o căutare după id de corelare returnează tot lanțul cererii. Discul VPS-ului nu
crește nelimitat.

### S3 · Uptime și alertare

Verificare externă pe `/health`, la fiecare minut, cu alertare pe un canal pe care îl citiți
efectiv. Alerta include ce s-a stricat și de cât timp.

**Acceptanță:** oprirea backend-ului declanșează alertă în sub trei minute.

### S4 · Metrici

Latență pe percentila 95 pe rută, rată de eroare, conexiuni Postgres ocupate, spațiu pe disc,
memorie PM2. Un singur tablou de bord.

**Acceptanță:** tabloul răspunde la "e lent din cauza bazei de date sau a aplicației?" fără
investigație suplimentară.

### S5 · Runbook

Un document scurt, pentru situațiile previzibile: aplicația nu răspunde, baza de date refuză
conexiuni, discul e plin, certificatul a expirat, un deploy a mers prost și trebuie revenit,
S3 nu răspunde și facturile nu se generează. Fiecare cu pași concreți, nu principii.

**Acceptanță:** cineva care nu a scris codul poate urma pașii și restabili serviciul.

> **Scris (27 septembrie 2026): [docs/runbook.md](../runbook.md).** Un tabel „ce vezi → unde te
> uiți", intrarea pe instanță prin Session Manager, cum se repară un bug de la codul de pe ecran
> până la „Marchează rezolvată", treisprezece incidente — cele șase de aici plus emailurile,
> SmartBill, site-ul, conturile, agentul din birou, revenirea după un deploy și restaurarea — și
> corectarea datelor: întâi ecranele, cu ce face fiecare pe lângă scriere, SQL-ul doar la urmă, cu
> ce ocolește. **Acceptanța rămâne deschisă pe jumătate:** pașii n-au fost urmați încă de cineva care
> nu i-a scris, iar restaurarea din backup e marcată neprobată (E04 S4). Ce se află pe instanță și
> nu e în repo — numele procesului PM2, prefixul backup-urilor — e numit ca atare, cu comanda care îl
> arată.

### S6 · Bugete de performanță

Praguri explicite pe fluxurile care contează: login sub 500ms, listarea facturilor sub 800ms,
generarea unui PDF sub 3s. Măsurate, nu presupuse. Depășirea lor e un bug, nu o observație.

**Acceptanță:** pragurile sunt scrise aici și verificate de o probă periodică.

## Dependențe

[E01](E01-infrastructura-medii.md) pentru mediul de producție, [E05](E05-robustete-backend.md)
pentru id-ul de corelare și `/health`.

## Riscuri

**Alertele prea zgomotoase sunt echivalente cu lipsa alertelor.** Mai bine trei alerte pe care le
citești mereu decât treizeci pe care le ignori. Se începe cu "aplicația e jos" și se adaugă doar
ce s-a dovedit necesar după un incident real.

**Datele copiilor nu au voie să ajungă în serviciul de erori.** Filtrarea se configurează înainte
de prima trimitere, nu după.

## Definition of done

O cădere de producție produce alertă înainte de un telefon. Fiecare eroare din producție e vizibilă
cu context. Runbook-ul a fost folosit măcar o dată, chiar și într-o simulare.

## Întrebări deschise

- Serviciu gestionat sau stivă auto-găzduită? La dimensiunea asta, gestionat e aproape sigur mai
  ieftin în timp de om.
- Cine primește alertele în afara orelor de program, și pe ce canal?

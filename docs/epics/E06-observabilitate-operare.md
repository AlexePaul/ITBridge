# E06 · Observabilitate și operare

**Status:** scos din MVP · **Pistă:** Fundație · **Depinde de:** E01, E05 · **Blochează:** alertarea
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

# Agentul de încărcare

Serviciul care urcă proiectele copiilor. Rulează pe **un singur calculator Windows, din birou**, și
urmărește un folder partajat pe rețea. E [E14](../../docs/epics/E14-proiecte-elevi.md) S2.

Textul e în română, ca restul documentației de proiect: e o procedură pe care o urmează cineva de la
școală, nu cod. Codul și comentariile din `src/` rămân în engleză, ca peste tot.

## Cum funcționează, în trei propoziții

Agentul oglindește în folderul partajat structura din baza de date — locație, grupă, copil. Profesorul
salvează lucrarea în folderul copilului, din Explorer sau direct din dialogul „Save as" al programului
în care s-a lucrat; **nimeni nu se autentifică și nu deschide nimic.** Agentul o găsește la următoarea
trecere, o urcă prin API și o mută în `_urcate\<data>`, ca profesorul să vadă din Explorer ce a plecat.

```
P:\Proiecte\<Locație>\<Grupă>\<Copil (#12)>\
P:\Proiecte\<Locație>\<Grupă>\<Copil (#12)>\_urcate\<data>\
P:\Proiecte\<Locație>\<Grupă>\_neatribuite\
```

**Numele folderului conține identificatorul copilului**, nu doar numele. Doi copii cu același prenume
într-o grupă nu sunt o ipoteză, iar un folder redenumit de mână nu are voie să orfanizeze fișierele
din el.

**Nimic nu se șterge de pe partajare.** Ce s-a urcat se mută în `_urcate`, ce nu s-a putut atribui se
mută în `_neatribuite` și apare pe ecranul grupei cu motivul.

**Dacă programul nu poate salva direct pe drive-ul mapat, se mută fișierul acolo.** Scratch în
browser, de exemplu, descarcă în `Downloads` fără să întrebe. Agentul nu are de unde ști cum a ajuns
fișierul în folder și nici nu-l interesează — tras cu mouse-ul e la fel de bun ca salvat direct. E
un gest în plus și e asumat; spune-le profesorilor asta din prima, ca să nu-l descopere singuri.

## Ce îi trebuie

- Node 22 sau mai nou. Agentul **nu are nicio dependență de runtime** — `fetch`, `FormData` și
  `crypto` sunt din Node, iar ce iese din compilare nu importă nimic din afara lui. Nu se copiază
  niciun `node_modules` pe calculatorul din birou.
- Un cont dedicat în platformă, cu rol `ADMIN`. Nu există alt rol: E09 a amânat rolurile, deci
  credențiala agentului poate face tot ce poate face un admin. E acceptat pentru că mașina stă în
  birou; **se reia la primul profesor care nu e proprietar.**
- Drive-ul de rețea mapat sau calea UNC către partajare.

## Instalare pe calculatorul din birou

Clonează repo-ul pe calculatorul din birou, deschide **PowerShell ca administrator** și rulează:

```powershell
cd apps\agent
.\install.ps1
```

Te întreabă ce nu i-ai dat pe linia de comandă — adresa API, utilizatorul agentului și parola lui,
folderul cu proiecte — apoi construiește ce trebuie construit, copiază în `C:\itbridge-agent`, scrie
`.env`, înregistrează sarcina care pornește la boot și o pornește. La final îți arată primele linii
din log, ca să nu pleci de la mașină fără să știi dacă merge.

Cu toate răspunsurile dinainte, dintr-o singură comandă:

```powershell
.\install.ps1 -ApiBase https://api.itbridgeschool.com -AgentUser agent-birou -Root D:\Proiecte -AgentName birou-straulesti
```

Dezinstalare: `.\install.ps1 -Uninstall`. Scoate sarcina și lasă `C:\itbridge-agent` pe disc — acolo
sunt log-urile și tokenul salvat, iar o reinstalare peste ele nu arată ca o primă instalare.

### Calea către foldere: locală, nu drive mapat

**`-Root` trebuie să fie o cale locală pe calculatorul ăsta** — `D:\Proiecte`, nu `P:\Proiecte`.
Aranjamentul normal e că acest calculator **găzduiește** partajarea, iar mașinile din laborator au
`P:` mapat la ea.

Motivul e o capcană clasică de Windows, și installerul refuză explicit ca să n-o descoperi singur: o
literă de drive mapat aparține sesiunii unui utilizator logat, iar o sarcină pornită la boot n-are
niciuna. Agentul ar porni, ar bate pulsul vesel și n-ar urca nimic — adică exact tăcerea ambiguă pe
care pulsul există ca s-o elimine.

Dacă folderul e totuși pe alt calculator, dă calea UNC și un cont care are drepturi pe ea:

```powershell
.\install.ps1 -Root \\SRV\Proiecte -RunAsUser DOMENIU\cont-birou
```

### Sarcină programată, nu serviciu Windows

Un serviciu Windows trebuie să vorbească protocolul Service Control Manager, ceea ce `node.exe` nu
face — de aia există NSSM și celelalte wrappere. O sarcină programată cu declanșator la pornire face
aceeași treabă, e în Windows din start și nu cere nimic descărcat. „Clonez și rulez" era ideea.

Ce e configurat: pornire la boot, repornire la un minut dacă moare, fără limită de timp de execuție,
o singură instanță, iar stdout și stderr merg în `C:\itbridge-agent\logs\agent.log`. Agentul scrie
o linie per trecere doar când s-a întâmplat ceva, deci fișierul crește cu câțiva kiloocteți pe zi și
n-are nevoie de rotație.

### După instalare

Deschide `/admin/proiecte`. Acolo scrie când a raportat agentul ultima oară. **După trei ore fără
puls ecranul spune explicit că a tăcut** — pentru că altfel „azi n-a urcat nimic" și „calculatorul e
oprit" arată identic. Asta e jumătatea care face uitatul de el sigur.

## Drepturile pe partajare

Accesul se dă **contului cu care rulează calculatoarele din laborator, nu grupului `Everyone`.** Un
share cu un folder per copil, lizibil de pe orice mașină din școală, e o divulgare mică dar reală: e o
listă cu numele copiilor înscriși. Scrie-l în procedură, nu-l presupune.

Partajarea nu trebuie să fie accesibilă din afara rețelei școlii. Dacă vreodată devine, se redeschide
și discuția despre antivirus — vezi „Decizii luate" în epic.

## Ce nu face

- **Nu deduce prezența.** Un fișier apărut în folderul unui copil dovedește că cineva a salvat un
  fișier, nu că a stat copilul pe scaun. Prezența rămâne un act deliberat, marcat de un om.
- **Nu urcă video.** Fișierele mari merg direct în S3 prin URL semnat, printr-un flux în doi pași pe
  care API-ul îl expune; agentul nu îl folosește încă.
- **Nu intră în subfolderele făcute de mână** în folderul unui copil. Scanarea e la un singur nivel,
  fiindcă `_urcate` e chiar sub el și o parcurgere recursivă ar reîncărca la fiecare trecere tot ce a
  fost deja trimis.
- **Nu șterge nimic**, niciodată, de nicăieri.

## Dezvoltare

```bash
pnpm --filter agent typecheck
pnpm --filter agent test     # node --test, pe ce iese din tsc
pnpm --filter agent build
```

Testele se compilează întâi și rulează din `dist`: fișierele `.ts` cu `import` sunt interpretate de
Node ca module ES, iar acolo importurile fără extensie nu se rezolvă — ceea ce ar însemna fie extensii
`.js` scrise de mână prin toată sursa, fie un al doilea `tsconfig`. Compilarea rezolvă amândouă.

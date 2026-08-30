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
  `crypto` sunt din Node.
- Un cont dedicat în platformă, cu rol `ADMIN`. Nu există alt rol: E09 a amânat rolurile, deci
  credențiala agentului poate face tot ce poate face un admin. E acceptat pentru că mașina stă în
  birou; **se reia la primul profesor care nu e proprietar.**
- Drive-ul de rețea mapat sau calea UNC către partajare.

## Instalare pe calculatorul din birou

1. **Construiește pachetul**, de pe mașina de dezvoltare:

    ```bash
    pnpm --filter agent build
    ```

    Copiază pe calculatorul din birou `apps/agent/dist`, `apps/agent/package.json` și
    `node_modules` (sunt doar tipuri, deci practic gol).

2. **Scrie `.env`** lângă `dist`, în folderul din care pornește serviciul:

    ```ini
    ITBRIDGE_API_BASE=https://api.itbridgeschool.com
    ITBRIDGE_AGENT_USERNAME=agent-birou
    ITBRIDGE_AGENT_PASSWORD=...
    ITBRIDGE_AGENT_ROOT=P:\Proiecte
    ITBRIDGE_AGENT_NAME=birou-straulesti
    ```

    Restul au valori implicite bune: scanare la 30s, oglindire la 15 minute, puls la 5 minute.

3. **Verifică o dată, în consolă**, înainte să faci serviciu din el:

    ```
    node dist\index.js
    ```

    Ar trebui să scrie `Watching P:\Proiecte every 30s.` și să creeze folderele. Dacă o variabilă
    lipsește, refuză să pornească și spune care — intenționat: un agent care pornește fără calea către
    partajare ar bate pulsul vesel în timp ce nu urcă nimic, adică exact tăcerea ambiguă pe care pulsul
    trebuie s-o elimine.

4. **Fă-l serviciu Windows**, ca să pornească odată cu calculatorul și să se repornească singur.
   Cu [NSSM](https://nssm.cc/):

    ```
    nssm install ITBridgeAgent "C:\Program Files\nodejs\node.exe" "C:\itbridge-agent\dist\index.js"
    nssm set ITBridgeAgent AppDirectory C:\itbridge-agent
    nssm set ITBridgeAgent AppStdout C:\itbridge-agent\logs\out.log
    nssm set ITBridgeAgent AppStderr C:\itbridge-agent\logs\err.log
    nssm set ITBridgeAgent AppRotateFiles 1
    nssm start ITBridgeAgent
    ```

    Agentul nu-și scrie propriul fișier de log tocmai pentru asta: NSSM prinde deja stdout și stderr și
    le rotește, iar un al doilea log ar însemna două locuri de căutat și unul care umple un disc dintr-un
    birou în care nu intră nimeni.

5. **Confirmă din interfață.** `/admin/proiecte` arată când a raportat agentul ultima oară. După trei
   ore fără puls, ecranul spune explicit că a tăcut — pentru că altfel „azi n-a urcat nimic" și
   „calculatorul e oprit" arată identic.

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

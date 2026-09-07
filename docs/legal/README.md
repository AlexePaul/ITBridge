# Textele juridice — E22 S2

Cele trei documente pe care le citește și le acceptă o familie, în ordinea în care le întâlnește:

| Fișier                                                               | Cine îl citește                              | Când                                                             |
| -------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| [politica-de-cookies.md](politica-de-cookies.md)                     | orice vizitator al site-ului                 | din footer; bannerul din E07 S5 trimite aici                     |
| [politica-de-confidentialitate.md](politica-de-confidentialitate.md) | vizitator, familie la probă, părinte cu cont | din footer, de pe `/proba`, la înregistrare                      |
| [termeni-si-conditii.md](termeni-si-conditii.md)                     | părintele care își face cont                 | acceptat la înregistrare; versiunea acceptată se reține (E22 S4) |

**Starea: ciornă 0.1, neverificată de avocat.** Pe `release/stage` textele **sunt pagini** —
`/termeni`, `/confidentialitate`, `/cookies`, randate din fișierele de aici de
`apps/web/server/api/legal/[doc].get.ts` —, iar înregistrarea cere bifa de acceptare și scrie în
`document_acceptances` versiunea fiecărui document (E22 S4, prima jumătate). Pe `release/prod` nu
ajung până nu trec pe la avocat și nu se umplu placeholder-ele: acolo ar fi un contract cu
`[[CUI]]` în el.

## De unde vin faptele

Documentele descriu platforma așa cum e în cod, nu cum ar trebui să fie. Fiecare afirmație despre
ce se stochează sau ce se întâmplă are o sursă; când sursa se schimbă, se schimbă și fraza.

| Afirmația din text                                                                                           | Sursa                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ce câmpuri se țin despre cont, copil, înscriere, prezență, absență, lucrare, factură, plată, cerere de probă | `apps/api/src/entities/*.entity.ts` — inventarul din E07 S1 încă nu există, deci documentele s-au scris direct din entități                                                          |
| cele cinci câmpuri la înregistrare și cele obligatorii după                                                  | `RegisterDto`, `isProfileComplete` din `profile.entity.ts`                                                                                                                           |
| linkul de confirmare valabil 48 de ore                                                                       | `CONFIRMATION_TTL_MS` în `email-confirmation.service.ts`                                                                                                                             |
| acces 15 minute, reîmprospătare 7 zile, revocarea lanțului la refolosire                                     | `jwtConstants.ts`, `session.service.ts`                                                                                                                                              |
| ce poate scrie un părinte din portal                                                                         | `PARENT_WRITABLE` din `authorization.spec.ts`                                                                                                                                        |
| termenul de anunțare a absenței: luni 12:00, pe săptămână                                                    | `NOTICE_DEADLINE_HOUR` în `absence-notice.rules.ts`                                                                                                                                  |
| recuperarea: mutare de către birou, în aceeași săptămână, fără credit                                        | `replacement.service.ts`, E12 S4                                                                                                                                                     |
| 48 de ore de răspuns la oferta de pe lista de așteptare                                                      | `WAITLIST_RESPONSE_HOURS` în `enrollment.service.ts`                                                                                                                                 |
| preț pe ședință ținută, tarif întreg pentru copilul cu cele mai multe ședințe                                | `pricing.ts`, `billable-sessions.rules.ts`                                                                                                                                           |
| termen de plată 14 zile; memento cu 3 zile înainte, apoi săptămânal, tăcere după 60                          | `arrears.rules.ts`, `arrears.job.ts`                                                                                                                                                 |
| lista mesajelor de serviciu                                                                                  | `template-defaults.ts`, `waitlist-mail.ts`, `lead-mail.ts`, `class-session-notifier.ts`                                                                                              |
| marketing implicit oprit, neconsultat de tranzacțional                                                       | `Profile.marketingOptIn`, `OutboxService.queueMarketing`, `marketing-consent.spec.ts`                                                                                                |
| fișierele lucrărilor: tipuri, chei fără nume de copil, link semnat 15 minute, atașament                      | `file-types.ts`, `project.keys.ts`, `DEFAULT_SIGNED_URL_TTL_SECONDS` în `s3.service.ts`                                                                                              |
| dosarul copilului pe calculatorul din birou poartă numele și identificatorul                                 | `apps/agent/README.md`                                                                                                                                                               |
| listele interne care nu declanșează nimic                                                                    | `early-signals.service.ts`, `signals.rules.ts`, E21 S7                                                                                                                               |
| cookie-urile și ce e în `localStorage`                                                                       | `tokenStore.ts`, `locationStore.ts`, `useChildSelection.ts`, `useAttendanceQueue.ts`                                                                                                 |
| harta Google, singurul terț de pe site                                                                       | `mapEmbedUrl` în `shared/school.ts`, paginile din `pages/locatii/`                                                                                                                   |
| hărțile se încarcă azi fără acord                                                                            | `loading="lazy"` pe `<iframe>`, fără poartă — E07 S5                                                                                                                                 |
| regiunea: Stockholm (`eu-north-1`), pentru server, bază, fișiere și backup                                   | `.env.stage.example`, E01 S4, E04 S4; `.env.example` și `ci.yml` spun `eu-central-1` doar pentru dezvoltare și CI. Producția nu există încă — de confirmat că rămâne aceeași regiune |
| fără CNP, fără fotografii ale copiilor, fără date de sănătate                                                | E16 „Decizii luate", E07 „Decizii luate"; niciun câmp în entități                                                                                                                    |
| versiunea acceptată la înregistrare e cea din capul fișierului                                               | `LEGAL_DOCUMENT_VERSIONS` în `apps/api/src/modules/auth/legal-documents.ts`, ținută egală cu prima linie boldată a fiecărui document de `legal-documents.spec.ts`                    |

## Ce lipsește: `[[…]]`

Tot ce e între paranteze duble e fie un fapt pe care codul nu-l știe, fie o decizie a școlii.
Lista, ca să se poată bifa:

**Fapte despre firmă** — apar în toate trei:

- denumirea legală, forma juridică, sediul social, numărul de la Registrul Comerțului, CUI;
- adresa de corespondență, dacă diferă de sediu;
- statutul de TVA (plătitoare sau nu) — Legea 365/2002 cere să fie afișat pe site;
- persoana care răspunde de protecția datelor și o adresă de email pentru asta (propunere:
  `date@itbridgeschool.com`, redirectată către office@);
- cabinetul de contabilitate, dacă vede date de familii, și dacă are acord de prelucrare.

**Decizii ale școlii** — cifrele din documente sunt propuneri, marcate `[[PROPUNERE: …]]`:

- **termenul de păstrare după retragere** — propus 12 luni. E numărul din E22 S3, cel pe care îl
  implementează E07 S4 și E04 S5; odată publicat, devine promisiune;
- cererile de probă care nu duc la înscriere — propus 12 luni de la ultima activitate;
- copiile mesajelor din `outbox` — propus 12 luni; azi nu se șterg niciodată;
- logurile serverului — propus 30 de zile; depinde de rotația de loguri din `ecosystem.config.js`,
  care stă pe instanță, nu în repo;
- mesajele din formularul de contact — propus 24 de luni; trăiesc în căsuța de email, nu în
  platformă;
- preavizul la schimbarea termenilor — propus 15 zile; termenul de răspuns la reclamații — propus
  10 zile lucrătoare;
- ce se întâmplă cu dosarele de lucrări de pe calculatorul din birou după retragere;
- dacă un al doilea părinte primește cont propriu sau familia folosește unul singur;
- dacă alegerea de a încărca harta se ține minte într-un cookie sau se întreabă de fiecare dată;
- reducerea de recomandare: 50% pe o lună — de confirmat că e regula anunțată familiilor.

**Fapte despre furnizori** — verificate pe 7 septembrie 2026, pe paginile lor:

- Vercel, Resend, AWS și Google LLC sunt certificate în Cadrul UE–SUA de protecție a datelor (DPF);
  Resend are și clauze contractuale standard în DPA, dar ține datele de cont și jurnalele în SUA,
  fără opțiune de stocare în UE. Rămâne de verificat, în conturi, că acordurile de prelucrare sunt
  acceptate (E07 S7);
- SmartBill: intră în text abia când E16 S2 e livrat; până atunci paragraful e marcat.

## Ce trebuie să existe înainte de publicare

1. **Avocatul.** Epicul e explicit: scris aici fiindcă aici se știe ce face sistemul; validitatea e
   a altcuiva. Lista de mai jos e ce i-am cere să verifice în mod special.
2. **E07 S5** — harta de pe paginile locațiilor se încarcă azi fără acord. Politica de cookie-uri
   descrie starea de după, deci nu se publică înaintea bannerului.
3. **E22 S4, a doua jumătate** — re-acceptarea la versiune nouă, la prima autentificare de după.
   Prima jumătate e livrată: bifa la înregistrare, un rând per document în `document_acceptances`,
   cu versiunea. Termenii §4.7 și §18 promit amândouă jumătățile.
4. **E22 S3** — jobul care șterge la termen. Politica §7 promite un număr; fără job, e o minciună
   întreținută.
5. **E01 S4 pentru producție** — pe stage e livrat, deci regiunea și backup-ul zilnic sunt fapte; la
   producție se confirmă că rămân aceleași, plus rotația logurilor și retenția de 30 de zile a
   backup-urilor (E04 S4).
6. **E07 S7** — acordurile de prelucrare cu furnizorii din tabelul §5.2.
7. **`DELETE /profiles/:id` e azi în `PARENT_WRITABLE` și șterge fizic, în cascadă** — copiii,
   prezența, lucrările **și facturile** (`Invoice.parent` e `onDelete: 'CASCADE'`). Portalul n-are
   buton pentru el, dar endpoint-ul răspunde unui părinte autentificat. Documentele spun că
   ștergerea se cere la școală și că evidența facturilor rămâne; până la anonimizarea din E07 S4,
   ruta ar trebui restrânsă la admin sau să refuze un profil cu facturi. Sarcină propusă.
8. **Linia de dezabonare pe mesajele de marketing** — azi niciun mesaj promoțional nu spune cum se
   oprește (Legea 506/2004 art. 12, GDPR art. 7 alin. 3). Termenii §13 și politica §3.8 promit
   linia. Sarcină propusă.
9. **A doua bifă la înregistrare**, pentru clauzele pe care Codul civil (art. 1203) le numește
   neuzuale — limitarea răspunderii (§15), suspendarea (§14), modificarea unilaterală (§18): produc
   efecte doar dacă sunt acceptate expres, deci E22 S4 le cere separat, nu în bifa generală.

## Verificarea juridică

Făcută pe 7 septembrie 2026, clauză cu clauză, contra textelor de lege care se aplică. Nu e opinia
unui avocat: e o verificare a textului contra cerințelor, cu sursele la vedere, făcută de cine știe
ce face sistemul. Ce **nu** acoperă e scris la final.

| Cerința                                                                                                                     | Unde                       | Stare                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GDPR art. 12 — limbaj clar, gratuit, răspuns într-o lună                                                                    | confidențialitate §8       | ✓                                                                                                                                                                                   |
| art. 13 alin. 1 a–f — operator, contact, scopuri, temeiuri, interese legitime, destinatari, transferuri                     | §1, §3, §5, §6             | ✓; identitatea firmei e placeholder                                                                                                                                                 |
| art. 13 alin. 2 a–d, f — termene, drepturi, retragerea consimțământului, plângere, decizii automate                         | §7, §8, §3.10              | ✓                                                                                                                                                                                   |
| art. 13 alin. 2 e — ce e obligatoriu și ce se întâmplă dacă nu                                                              | §3.11                      | **adăugat** la verificare                                                                                                                                                           |
| art. 13 alin. 3 — informare înainte de un scop nou                                                                          | §10                        | **adăugat**                                                                                                                                                                         |
| art. 14 — date primite de la altcineva: persoana de urgență, copilul                                                        | §3.4, §3.5                 | ✓, sursa e numită; informarea persoanei de urgență trece prin părinte                                                                                                               |
| art. 6 — un temei pentru fiecare situație                                                                                   | §3                         | ✓; contractul pentru copil, consimțământ doar pentru marketing și hartă                                                                                                             |
| art. 7 alin. 3 — retragerea la fel de ușoară ca acordarea                                                                   | §3.8, termeni §13          | comutatorul există; **linia de dezabonare din mesaj lipsește** — sarcină                                                                                                            |
| art. 8 — copii sub 16 ani                                                                                                   | §4                         | ✓, contul e al părintelui                                                                                                                                                           |
| art. 9 — date de sănătate                                                                                                   | §3.5                       | **întărit**: biroul nu scrie diagnostice; sarcină pentru indicația de pe câmp                                                                                                       |
| art. 21 alin. 2 — opoziția la marketing                                                                                     | §8                         | ✓                                                                                                                                                                                   |
| art. 22 — decizii automate                                                                                                  | §3.10                      | ✓, nu există                                                                                                                                                                        |
| art. 28 — acorduri cu împuterniciții                                                                                        | §5.2                       | tabelul e complet; **acordurile acceptate** sunt E07 S7                                                                                                                             |
| art. 30 — evidența prelucrărilor                                                                                            | —                          | **obligatorie**: prelucrarea datelor copiilor nu e ocazională, deci excepția pentru sub 250 de angajați nu se aplică. Inventarul din E07 S1 e chiar ea                              |
| art. 33–34 — breșe                                                                                                          | §9                         | ✓                                                                                                                                                                                   |
| art. 35 — DPIA                                                                                                              | —                          | probabil nu e cerută: lista ANSPDCP (Decizia 174/2018) vizează prelucrarea **pe scară largă** a datelor minorilor, iar școala are zeci de copii. De reevaluat dacă se schimbă scara |
| art. 44–46 — transferuri                                                                                                    | §6                         | **verificat**: DPF pentru Vercel, Resend, AWS, Google                                                                                                                               |
| Legea 190/2018                                                                                                              | §1                         | citată                                                                                                                                                                              |
| Legea 506/2004 art. 4 — cookie-uri fără acord doar dacă sunt strict necesare                                                | cookie-uri §2              | ✓, cu justificarea pentru cele două de preferință                                                                                                                                   |
| Legea 506/2004 art. 12 — marketing doar cu acord prealabil, cu refuz posibil din fiecare mesaj                              | termeni §13                | acordul ✓; **refuzul din mesaj lipsește** — sarcină                                                                                                                                 |
| Legea 365/2002 art. 5 — datele de identificare pe site                                                                      | termeni §1, site           | placeholder; **statutul de TVA** trebuie afișat și pe pagina de contact                                                                                                             |
| Legea 365/2002 art. 8–9 — pașii încheierii contractului electronic, limba, stocarea, corectarea erorilor                    | termeni §4.7               | **adăugat**                                                                                                                                                                         |
| Legea 193/2000 — clauze abuzive (anexa: limitarea răspunderii, modificarea unilaterală, restrângerea accesului la justiție) | termeni §14, §15, §18, §19 | **corectate**: excepție pentru intenție și culpă gravă, motiv întemeiat și drept de ieșire la modificare, contestarea suspendării, instanțele competente fără restrângere           |
| Cod civil art. 1203 — clauzele neuzuale cer acceptare expresă                                                               | termeni §14, §15, §18      | a doua bifă în E22 S4                                                                                                                                                               |
| OUG 34/2014 și OUG 141/2021 — contracte la distanță, servicii digitale                                                      | —                          | nu se aplică: contractul de înscriere e față în față, contul e gratuit și datele se prelucrează doar ca să funcționeze (excepția din OUG 141/2021 art. 3)                           |
| OG 21/1992 — informare în limba română                                                                                      | toate                      | ✓                                                                                                                                                                                   |
| Legea 82/1991 art. 25 — 5 ani de la 1 iulie a anului următor, pentru documente din 2023 încoace                             | §7                         | **verificat**                                                                                                                                                                       |
| Legea 272/2004 — drepturile copilului                                                                                       | §4                         | nimic peste GDPR pentru un curs privat; fără imagine, deci nici art. 73 Cod civil                                                                                                   |
| Platforma SOL/ODR                                                                                                           | termeni §19                | închisă în iulie 2025, deci necitată; rămân ANPC și SAL                                                                                                                             |

**Ce nu acoperă verificarea asta.** Faptele din afara codului: dacă acordurile de prelucrare sunt
acceptate în conturi, ce scrie în contractul de înscriere de pe hârtie (clauza de abandon din E15 e
acolo, nu aici), statutul de TVA, cine e persoana de contact. Practica: un text corect nu ajută dacă
biroul notează diagnostice sau dacă ștergerea nu rulează. Și jurisprudența: interpretările ANSPDCP
și ANPC se schimbă, iar textul ăsta e verificat contra legii, nu contra deciziilor lor din ultimul
an. Dacă se alege să nu treacă pe la un avocat, riscul rămas e în lista de mai sus, nu în text — și
e cel mai mare la art. 30 (evidența) și la E07 S7 (acordurile), amândouă fapte, nu fraze.

## Ediția PDF

`docs/legal/pdf/build.sh` scrie câte un PDF pentru fiecare document, în `docs/legal/pdf/out/`
(ignorat de git), din **aceleași fișiere Markdown** — nu există o a doua sursă. Cere `pandoc` și
XeLaTeX (diacriticele românești scot din discuție pdflatex), plus fonturile TeX Gyre ca pagina să
semene cu site-ul; fără ele cade pe DejaVu și spune asta. Pe Debian/Ubuntu, lista de pachete e în
capul scriptului.

Ce face în plus față de pagina web, fiindcă hârtia cere altceva: cuprins, subsol cu documentul,
versiunea și „pagina X din Y", versiunea și data citite din prima linie boldată, legăturile între
documente transformate în adrese publice, iar placeholder-ele `[[…]]` tipărite **roșu, îngroșat**,
ca o ciornă să nu poată fi luată drept document. Stilul stă în `legal.tex`, regulile de transformare
în `filters.lua`, marcarea placeholder-elor în `placeholders.py`.

PDF-urile nu se comit: un PDF vechi lângă un Markdown nou ar fi exact minciuna întreținută de care
vorbește epicul. Se regenerează la fiecare versiune publicată și se atașează acolo unde e nevoie.

## Regula de întreținere

O coloană nouă cu date personale înseamnă o frază nouă în politica de confidențialitate, în
aceeași schimbare. Mecanismul care ar face asta imposibil de uitat — inventarul derivat din
entități, cu test — e E07 S1 și nu e construit; până atunci regula e de citit, nu de rulat.
Documentele sunt în `docs/`, deci sunt identice pe `release/prod` și `release/stage` — dacă atingi
unul, adu-l și pe celălalt.

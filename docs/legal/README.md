# Textele juridice — E22 S2

Cele trei documente pe care le citește și le acceptă o familie, în ordinea în care le întâlnește:

| Fișier                                                               | Cine îl citește                              | Când                                                             |
| -------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| [politica-de-cookies.md](politica-de-cookies.md)                     | orice vizitator al site-ului                 | din footer; bannerul din E07 S5 trimite aici                     |
| [politica-de-confidentialitate.md](politica-de-confidentialitate.md) | vizitator, familie la probă, părinte cu cont | din footer, de pe `/proba`, la înregistrare                      |
| [termeni-si-conditii.md](termeni-si-conditii.md)                     | părintele care își face cont                 | acceptat la înregistrare; versiunea acceptată se reține (E22 S4) |

**Starea: ciornă 0.1, neverificată de avocat, nepublicată.** Nu sunt încă pagini în `apps/web` și
nu există bifa de acceptare la înregistrare — amândouă vin după ce textul trece pe la avocat, ca
să nu se versioneze de trei ori un document care încă nu e bun.

## De unde vin faptele

Documentele descriu platforma așa cum e în cod, nu cum ar trebui să fie. Fiecare afirmație despre
ce se stochează sau ce se întâmplă are o sursă; când sursa se schimbă, se schimbă și fraza.

| Afirmația din text                                                                                           | Sursa                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| ce câmpuri se țin despre cont, copil, înscriere, prezență, absență, lucrare, factură, plată, cerere de probă | `apps/api/src/entities/*.entity.ts` — inventarul din E07 S1 încă nu există, deci documentele s-au scris direct din entități |
| cele cinci câmpuri la înregistrare și cele obligatorii după                                                  | `RegisterDto`, `isProfileComplete` din `profile.entity.ts`                                                                  |
| linkul de confirmare valabil 48 de ore                                                                       | `CONFIRMATION_TTL_MS` în `email-confirmation.service.ts`                                                                    |
| acces 15 minute, reîmprospătare 7 zile, revocarea lanțului la refolosire                                     | `jwtConstants.ts`, `session.service.ts`                                                                                     |
| ce poate scrie un părinte din portal                                                                         | `PARENT_WRITABLE` din `authorization.spec.ts`                                                                               |
| termenul de anunțare a absenței: luni 12:00, pe săptămână                                                    | `NOTICE_DEADLINE_HOUR` în `absence-notice.rules.ts`                                                                         |
| recuperarea: mutare de către birou, în aceeași săptămână, fără credit                                        | `replacement.service.ts`, E12 S4                                                                                            |
| 48 de ore de răspuns la oferta de pe lista de așteptare                                                      | `WAITLIST_RESPONSE_HOURS` în `enrollment.service.ts`                                                                        |
| preț pe ședință ținută, tarif întreg pentru copilul cu cele mai multe ședințe                                | `pricing.ts`, `billable-sessions.rules.ts`                                                                                  |
| termen de plată 14 zile; memento cu 3 zile înainte, apoi săptămânal, tăcere după 60                          | `arrears.rules.ts`, `arrears.job.ts`                                                                                        |
| lista mesajelor de serviciu                                                                                  | `template-defaults.ts`, `waitlist-mail.ts`, `lead-mail.ts`, `class-session-notifier.ts`                                     |
| marketing implicit oprit, neconsultat de tranzacțional                                                       | `Profile.marketingOptIn`, `OutboxService.queueMarketing`, `marketing-consent.spec.ts`                                       |
| fișierele lucrărilor: tipuri, chei fără nume de copil, link semnat 15 minute, atașament                      | `file-types.ts`, `project.keys.ts`, `DEFAULT_SIGNED_URL_TTL_SECONDS` în `s3.service.ts`                                     |
| dosarul copilului pe calculatorul din birou poartă numele și identificatorul                                 | `apps/agent/README.md`                                                                                                      |
| listele interne care nu declanșează nimic                                                                    | `early-signals.service.ts`, `signals.rules.ts`, E21 S7                                                                      |
| cookie-urile și ce e în `localStorage`                                                                       | `tokenStore.ts`, `locationStore.ts`, `useChildSelection.ts`, `useAttendanceQueue.ts`                                        |
| harta Google, singurul terț de pe site                                                                       | `mapEmbedUrl` în `shared/school.ts`, paginile din `pages/locatii/`                                                          |
| hărțile se încarcă azi fără acord                                                                            | `loading="lazy"` pe `<iframe>`, fără poartă — E07 S5                                                                        |
| regiunea: Frankfurt                                                                                          | `AWS_REGION=eu-central-1` în `.env.example` și `ci.yml`; `deploy.yml` citește `vars.AWS_REGION`, de confirmat că e aceeași  |
| fără CNP, fără fotografii ale copiilor, fără date de sănătate                                                | E16 „Decizii luate", E07 „Decizii luate"; niciun câmp în entități                                                           |

## Ce lipsește: `[[…]]`

Tot ce e între paranteze duble e fie un fapt pe care codul nu-l știe, fie o decizie a școlii.
Lista, ca să se poată bifa:

**Fapte despre firmă** — apar în toate trei:

- denumirea legală, forma juridică, sediul social, numărul de la Registrul Comerțului, CUI;
- adresa de corespondență, dacă diferă de sediu;
- persoana care răspunde de protecția datelor și o adresă de email pentru asta (propunere:
  `date@itbridgeschool.com`, redirectată către office@);
- cabinetul de contabilitate, dacă vede date de familii, și dacă are acord de prelucrare.

**Decizii ale școlii** — cifrele din documente sunt propuneri, marcate `[[PROPUNERE: …]]`:

- **termenul de păstrare după retragere** — propus 12 luni. E numărul din E22 S3, cel pe care îl
  implementează E07 S4 și E04 S5; odată publicat, devine promisiune;
- cererile de probă care nu duc la înscriere — propus 12 luni de la ultima activitate;
- copiile mesajelor din `outbox` — propus 12 luni; azi nu se șterg niciodată;
- logurile serverului — propus 30 de zile; depinde de ce configurează E01 S4 în PM2;
- mesajele din formularul de contact — propus 24 de luni; trăiesc în căsuța de email, nu în
  platformă;
- preavizul la schimbarea termenilor — propus 15 zile; termenul de răspuns la reclamații — propus
  10 zile lucrătoare;
- ce se întâmplă cu dosarele de lucrări de pe calculatorul din birou după retragere;
- dacă un al doilea părinte primește cont propriu sau familia folosește unul singur;
- dacă alegerea de a încărca harta se ține minte într-un cookie sau se întreabă de fiecare dată;
- reducerea de recomandare: 50% pe o lună — de confirmat că e regula anunțată familiilor.

**Fapte despre furnizori** — de verificat în conturile respective, nu în cod:

- Vercel: regiunea funcțiilor serverless și a logurilor; certificarea Data Privacy Framework;
- Resend: dacă contul e setat pe regiunea UE; DPF sau clauze standard;
- Google: temeiul transferului pentru hartă;
- SmartBill: intră în text abia când E16 S2 e livrat; până atunci paragraful e marcat.

## Ce trebuie să existe înainte de publicare

1. **Avocatul.** Epicul e explicit: scris aici fiindcă aici se știe ce face sistemul; validitatea e
   a altcuiva. Lista de mai jos e ce i-am cere să verifice în mod special.
2. **E07 S5** — harta de pe paginile locațiilor se încarcă azi fără acord. Politica de cookie-uri
   descrie starea de după, deci nu se publică înaintea bannerului.
3. **E22 S4** — evidența acceptărilor: bifa la înregistrare, versiunea acceptată pe cont,
   re-acceptarea la versiune nouă. Termenii §18 promit exact asta.
4. **E22 S3** — jobul care șterge la termen. Politica §7 promite un număr; fără job, e o minciună
   întreținută.
5. **E01 S4** — regiunea, logurile și copiile de siguranță devin fapte, nu intenții.
6. **E07 S7** — acordurile de prelucrare cu furnizorii din tabelul §5.2.
7. **`DELETE /profiles/:id` e azi în `PARENT_WRITABLE` și șterge fizic, în cascadă** — copiii,
   prezența, lucrările **și facturile** (`Invoice.parent` e `onDelete: 'CASCADE'`). Portalul n-are
   buton pentru el, dar endpoint-ul răspunde unui părinte autentificat. Documentele spun că
   ștergerea se cere la școală și că evidența facturilor rămâne; până la anonimizarea din E07 S4,
   ruta ar trebui restrânsă la admin sau să refuze un profil cu facturi.

## Pentru avocat

Ce am scris și de ce, ca verificarea să înceapă de la întrebările grele, nu de la zero:

- **Nu există drept de retragere în 14 zile (OUG 34/2014).** Contractul de înscriere se semnează
  față în față, contul e aprobat de un om și nu se plătește nimic online — decizia e în E07
  „Decizii luate". Contul în sine e un serviciu digital gratuit, accesoriu contractului; datele se
  prelucrează doar ca să funcționeze, deci ar trebui să cadă sub excepția din OUG 141/2021 pentru
  serviciile digitale. De confirmat.
- **Clauzele care ar putea fi considerate abuzive (Legea 193/2000)** sau neuzuale (art. 1203 Cod
  civil): limitarea răspunderii (§15), modificarea unilaterală (§18), suspendarea contului (§14).
  Sunt scrise cât de îngust s-a putut; dacă tot cer acceptare expresă separată, E22 S4 poate
  cere o a doua bifă.
- **Datele copiilor.** Temeiul folosit e contractul semnat de părinte în numele copilului (art. 6
  alin. 1 lit. b), nu consimțământul; vârsta de consimțământ digital în România e 16, iar toți
  elevii sunt sub. Legea 272/2004 — de verificat dacă cere ceva în plus pentru evidența prezenței
  sau a lucrărilor.
- **Motivul absenței** e text liber și poate conține, fără să cerem, date de sănătate. Am pus
  cererea explicită să nu ni-l spună în detaliu (§3.5) în loc să interzicem câmpul. De confirmat că
  e suficient sau dacă trebuie un temei din art. 9.
- **Persoana de contact pentru urgențe** e un terț ale cărui date le primim de la părinte —
  informarea din art. 14 se face prin părinte (§3.4). De confirmat.
- **Transferurile în afara UE** pentru Vercel, Resend și Google — instrumentul potrivit pentru
  fiecare, după ce se verifică conturile.
- **Retenția facturilor** — 5 ani conform Legii contabilității 82/1991, cu modificările din 2023;
  de confirmat că nu e 10 pentru vreo categorie, și cum se anonimizează o factură păstrată.
- **Platforma SOL/ODR a Comisiei Europene a fost închisă în iulie 2025** — de asta nu e citată în
  §19; rămân ANPC și SAL.
- **Legea 506/2004 art. 4** — încadrarea celor patru cookie-uri ca strict necesare, mai ales
  `portalChild` și `selectedLocation`, care sunt de preferință, nu de autentificare.
- **Legea 365/2002** — datele de identificare care trebuie afișate pe site (§1 din termeni); de
  confirmat lista completă.

## Regula de întreținere

O coloană nouă cu date personale înseamnă o frază nouă în politica de confidențialitate, în
aceeași schimbare. Mecanismul care ar face asta imposibil de uitat — inventarul derivat din
entități, cu test — e E07 S1 și nu e construit; până atunci regula e de citit, nu de rulat.
Documentele sunt în `docs/`, deci sunt identice pe `release/prod` și `release/stage` — dacă atingi
unul, adu-l și pe celălalt.

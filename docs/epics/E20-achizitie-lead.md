# E20 · Achiziție, lecții de probă și lead management

**Status:** propus · **Pistă:** Public · **Depinde de:** E17, E18 · **Blochează:** —

## Problemă

Site-ul are un formular de contact — `apps/web/app/pages/contact.vue`, cu ruta
`apps/web/server/api/contact.post.ts` și schema partajată în `apps/web/shared/contact.ts` — dar
mesajul pleacă pe email către adresa școlii și nu lasă nicio urmă în platformă. Nu există programare
la probă, nu există noțiunea de lead.

Deci pâlnia se termină într-o cutie poștală. Nu se poate spune câte cereri au fost, care a rămas
fără răspuns, sau care s-a transformat în înscriere — informația trăiește în inbox, în ordinea în
care a sosit, și dispare odată cu el. Iar cine vrea o probă tot trebuie să sune, fiindcă formularul
nu programează nimic: cere efort și curaj, mai ales seara, când oamenii caută de fapt.

Epicul repară a doua jumătate, nu prima: **mesajul de contact rămâne un email**, iar pâlnia se
măsoară de la programarea la probă încolo. Motivul e în [Decizii luate](#decizii-luate).

Ce lipsește complet:

- **Nu există noțiunea de lead.** Cineva care întreabă și nu se înscrie nu lasă nicio urmă în
  platformă. Nu poți reveni la el, nu poți ști câți au fost.
- **Nu există programare la lecție de probă**, deși proba e mecanismul principal de conversie într-o
  școală.
- **Nu se măsoară nimic.** Nu știi de unde vin oamenii, câți întreabă, câți vin la probă, câți se
  înscriu. Deci nu poți ști ce funcționează.
- **Nu există urmărire.** Un părinte care a întrebat în septembrie și a zis "poate în primăvară" e
  pierdut definitiv.
- **Nu există recomandări.** Într-o școală pentru copii, recomandarea între părinți e cel mai
  puternic canal, și nu e sprijinită de nimic.

Cu două locații și ambiția de creștere, e cea mai mare gaură din tot planul: se investește în
[E18](E18-frontend-portal.md) și [E19](E19-seo-geo.md) ca să vină oameni pe site, iar site-ul nu
are ce face cu ei.

## Rezultat

Un părinte interesat își programează singur o lecție de probă, în două minute, fără să sune. Fiecare
cerere e urmărită până la înscriere sau la un "nu" explicit. Se știe ce canal aduce familii.

## În scop

- Modelul de lead, cu sursă și stare.
- Programare la lecție de probă, direct din site.
- Urmărire și memento-uri.
- Măsurarea pâlniei.
- Program de recomandare.

## În afara scopului

- Conținutul care aduce trafic — vezi [E19](E19-seo-geo.md).
- Ce se întâmplă după înscriere — vezi [E11](E11-inscrieri-capacitate.md).
- **Formularul de contact.** Rămâne exact cum e: trimite un email din ruta Nitro și nu lasă urmă în
  platformă — vezi [Decizii luate](#decizii-luate).

## Story-uri

### S1 · Modelul de lead

`Lead`: date de contact, copil (vârstă, experiență), interes (modul, locație), sursă, canal, stare
(`nou`, `contactat`, `probă programată`, `probă ținută`, `înscris`, `pierdut`), motiv la pierdere,
responsabil, note, dată de urmărire.

La înscriere, lead-ul se transformă în `Profile` plus `Child`, păstrând legătura — ca să se poată
raporta ulterior costul de achiziție pe familie.

**Acceptanță:** fiecare cerere din orice canal creează un lead. Niciunul nu rămâne fără responsabil.

### S2 · Programare la lecție de probă

Un flux public, fără cont: alege locația, vezi grupele compatibile cu vârsta copilului și cu locuri
libere — date din [E11](E11-inscrieri-capacitate.md) — alege ora, lasă datele, primești confirmare.

Sub două minute, fără telefon, funcțional pe mobil. Confirmarea și memento-ul cu o zi înainte pleacă
prin [E17](E17-comunicare-notificari.md).

E un formular public care scrie în baza de date date despre un copil, deci are nevoie de aceeași
protecție ca formularul de contact — și tiparul e deja scris. Ruta de contact are un honeypot
(`HONEYPOT_FIELD` din `apps/web/shared/contact.ts`, verificat în rută, care răspunde 200 și nu
trimite nimic) și o limită de cinci trimiteri la 15 minute per IP. Cât valorează a doua o spune
singur comentariul din `apps/web/server/utils/rate-limit.ts`: contorul stă în memoria unei instanțe
serverless, deci prinde bucla care cade pe o instanță caldă, nu o inundație distribuită. Pragul a
fost ales pentru un email; aici, unde fiecare trimitere devine un rând în bază, se reevaluează.
Cerința rămâne cea veche — protecție care nu enervează un părinte real.

**Acceptanță:** o programare completă durează sub două minute pe telefon. Proba apare direct în
lista profesorului. Un mesaj prins de honeypot nu creează lead, iar expeditorul primește același
răspuns ca la o trimitere reușită.

### S3 · Urmărire

Fiecare lead are următorul pas cu termen. Lead-urile fără activitate ies în evidență. Cel care nu s-a
prezentat la probă e recontactat automat. Cel care a zis "poate mai târziu" primește memento la data
stabilită.

**Acceptanță:** niciun lead nu stă mai mult de șapte zile fără acțiune, fără ca cineva să fie
anunțat.

### S4 · Măsurarea pâlniei

Vizitator, cerere, probă programată, probă ținută, înscriere — cu rate de conversie între etape, pe
sursă și pe locație. Intră în [E21](E21-raportare-analytics.md).

Cea mai importantă cifră e conversia de la probă ținută la înscriere. Dacă e mică, problema e la
curs, nu la marketing — și e o informație pe care nu o poți afla altfel.

**Acceptanță:** raportul răspunde la "ce canal aduce cele mai multe înscrieri, și la ce cost".

### S5 · Recomandări

Un părinte existent recomandă altul, cu legătură urmăribilă și beneficiu pentru amândoi — o reducere
la modulul următor, de pildă, aplicată prin [E15](E15-pricing-facturare.md).

Într-o școală pentru copii, e cel mai ieftin și mai eficient canal, pentru că părinții vorbesc
oricum între ei. Merită doar să fie sprijinit și măsurat.

**Acceptanță:** un părinte generează o legătură de recomandare din portal, iar beneficiul se aplică
automat la înscrierea celui recomandat.

## Dependențe

[E17](E17-comunicare-notificari.md) pentru confirmări și memento-uri,
[E18](E18-frontend-portal.md) pentru interfață, [E11](E11-inscrieri-capacitate.md) pentru locurile
disponibile.

## Riscuri

**Un lead colectat și necontactat e mai rău decât unul necolectat.** Părintele a făcut un pas și a
fost ignorat. Sistemul nu trebuie pornit înainte să existe cineva care răspunde, cu termen asumat.

**Datele lead-urilor sunt date personale, inclusiv despre copii.** Intră integral sub
[E07](E07-securitate-gdpr.md): temei legal, termen de păstrare pentru cei care nu se înscriu,
consimțământ pentru comunicări comerciale.

**Programarea automată poate suprapopula grupele cu probe.** Trebuie limitat numărul de probe
simultane per grupă, altfel cursul are de suferit.

## Definition of done

Programarea la probă funcționează fără telefon. Fiecare lead are stare și responsabil. Pâlnia se
măsoară pe sursă și pe locație.

## Decizii luate

**Formularul de contact rămâne pe email, trimis din frontend.** Nu scrie `Lead`, nu atinge
backend-ul, nu se schimbă.

Alternativa — aceeași trimitere produce și un rând în Postgres — sună ieftin și nu e. Cele șapte
pagini publice funcționează astăzi fără `API_BASE`, și exact de aceea site-ul stă în producție deși
backend-ul nu e deployat nicăieri. Un formular care cere API-ul leagă singura pagină de conversie de
singura instanță EC2, iar ca să nu o lege trebuie o ramură de rezervă: dacă API-ul tace, mesajul tot
pleacă pe email și lead-ul lipsește. Adică două căi de scriere și o stare parțială de întreținut,
pentru un mesaj care oricum ajunge la un om care îl citește.

Costul deciziei, spus pe față: **un mesaj de contact nu lasă nicio urmă în platformă.** Nu se poate
număra câte întrebări au venit, nici ce s-a ales din ele. Se acceptă, pentru că întrebarea care
contează comercial nu e „câți au scris", ci „câți au venit la probă și câți s-au înscris" — iar aia
se măsoară din S2 încolo, unde există oricum un rând, fiindcă o programare are dată, copil și
locație.

Se reia dacă volumul de mesaje ajunge să nu mai încapă într-un inbox, sau dacă cineva chiar
întreabă care a rămas fără răspuns.

**Proba e gratuită** — vezi [E11](E11-inscrieri-capacitate.md).

Pentru acest epic, consecința e că S2 și S3 se schimbă la fel de mult ca S1:

- **Volumul de programări va fi mai mare, calitatea mai mică.** Măsurarea din S4 devine esențială,
  pentru că fără miză financiară rata de neprezentare e singurul semnal de calitate a canalului.
- **Memento-ul înainte de probă nu e o rafinare, e o cerință.** Fără el, neprezentările la o probă
  gratuită ajung frecvent la o treime.
- **Conversia care contează e probă ținută → înscriere**, nu programare → înscriere. A doua
  amestecă două probleme diferite: dacă oamenii vin, și dacă le place cursul.

## Întrebări deschise

- Cine răspunde lead-urilor, și în cât timp?
- Câte probe simultane suportă o grupă fără să deranjeze cursul?
- Care e beneficiul la recomandare, și cine îl suportă?

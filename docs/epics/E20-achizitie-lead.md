# E20 · Achiziție, lecții de probă și lead management

**Status:** propus · **Pistă:** Public · **Depinde de:** E17, E18 · **Blochează:** —

## Problemă

Site-ul nu are niciun mecanism de conversie. `pages/contact.vue` afișează telefon, email și program.
Atât. Nu există formular, nu există programare, nu există nimic care să transforme un vizitator
interesat într-o programare.

Deci pâlnia arată așa: părintele găsește site-ul, citește, și trebuie să sune. Fiecare pas pierde
oameni, iar cel mai mare pierde cei mai mulți — sunatul cere efort și curaj, mai ales seara, când
oamenii caută de fapt.

Ce lipsește complet:

- **Nu există noțiunea de lead.** Cineva care întreabă și nu se înscrie nu lasă nicio urmă. Nu poți
  reveni la el, nu poți ști câți au fost.
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
- Formulare de contact care chiar funcționează.

## În afara scopului

- Conținutul care aduce trafic — vezi [E19](E19-seo-geo.md).
- Ce se întâmplă după înscriere — vezi [E11](E11-inscrieri-capacitate.md).

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

**Acceptanță:** o programare completă durează sub două minute pe telefon. Proba apare direct în
lista profesorului.

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

### S6 · Formulare de contact

Pe fiecare pagină publică, potrivite contextului: pe pagina unui modul, întrebarea e despre acel
modul, cu datele precompletate. Cu protecție anti-spam care nu enervează utilizatorii reali.

**Acceptanță:** trimiterea unui formular creează lead și confirmare automată în sub un minut.

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

## Întrebări deschise

- Cine răspunde lead-urilor, și în cât timp?
- Proba e gratuită? Schimbă complet rata de conversie și calitatea lead-urilor.
- Câte probe simultane suportă o grupă fără să deranjeze cursul?
- Care e beneficiul la recomandare, și cine îl suportă?

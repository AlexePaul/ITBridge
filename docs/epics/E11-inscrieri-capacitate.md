# E11 · Înscrieri, grupe și capacitate

**Status:** propus · **Pistă:** Operațiuni · **Depinde de:** E08, E09, E10 · **Blochează:** E12, E15

## Problemă

Înscrierea unui copil într-o grupă e astăzi o singură operație brută:
`POST /children/:childId/groups/:groupId`, rezervată adminului, care doar setează o cheie străină.

Ce lipsește:

- **Capacitate.** `Group` nu are număr maxim de locuri. Nimic nu împiedică al doisprezecelea copil
  într-o sală cu zece calculatoare.
- **Istoric.** `Child.group` e o singură referință. Când un copil se mută dintr-o grupă în alta,
  legătura veche se pierde. Nu poți răspunde la "în ce grupă era în octombrie?", ceea ce e exact
  informația de care ai nevoie când verifici o factură contestată.
- **Perioadă.** Nu există dată de început și de sfârșit ale participării. Un copil e în grupă sau
  nu, atemporal.
- **Listă de așteptare.** O grupă plină nu are unde ține cererile.
- **Lecție de probă.** Nu există noțiunea, deși e mecanismul principal prin care un copil devine
  elev.
- **Compatibilitate.** Nimic nu verifică dacă vârsta copilului se potrivește cu intervalul grupei
  sau dacă are cerințele prealabile ale modulului din [E10](E10-curriculum-module.md).

Consecința pentru facturare: [E15](E15-pricing-facturare.md) trebuie să știe cine a fost înscris în
ce modul, în ce perioadă. Cu modelul actual, informația nu există.

## Rezultat

Înscrierea e o entitate cu durată, istoric și stare. Capacitatea e respectată. Un părinte poate
cere un loc singur, iar o grupă plină pune cererea pe listă în loc să o refuze.

## În scop

- Entitatea `Enrollment`, cu perioadă și stare.
- Capacitate și liste de așteptare.
- Lecții de probă.
- Transferuri între grupe și locații.
- Verificări de compatibilitate.
- Formarea de grupe noi.

## În afara scopului

- Prețul înscrierii — vezi [E15](E15-pricing-facturare.md).
- Funnel-ul public de achiziție — vezi [E20](E20-achizitie-lead.md). Aici e vorba de ce se întâmplă
  după ce cineva vrea un loc.

## Story-uri

### S1 · Entitatea de înscriere

`Enrollment`: copil, grupă, modul, dată de început, dată de sfârșit, stare (`probă`, `activă`,
`încheiată`, `abandonată`, `transferată`), motiv la ieșire. Înlocuiește legătura directă
`Child.group`, care rămâne cel mult ca proprietate derivată pentru compatibilitate.

**Acceptanță:** "în ce grupă era copilul X pe 15 octombrie" are răspuns exact. Istoricul actual e
migrat cât se poate de fidel, iar ce nu se poate reconstitui e marcat ca atare.

### S2 · Capacitate și listă de așteptare

`Group` are capacitate maximă, derivată implicit din capacitatea sălii. Depășirea e blocată, cu
excepție explicită pentru admin, care lasă urmă în audit log. O grupă plină acceptă înscrieri pe
listă de așteptare, cu ordine și dată.

Când se eliberează un loc, primul de pe listă e notificat automat, prin
[E17](E17-comunicare-notificari.md), cu termen de răspuns.

**Acceptanță:** înscrierea peste capacitate e refuzată cu mesaj util și ofertă de listă. Eliberarea
unui loc declanșează notificarea în sub un minut.

### S3 · Lecție de probă

O înscriere în starea `probă`, cu o singură ședință, care nu se facturează. La final, se transformă
în înscriere activă sau se închide, cu motiv înregistrat.

Rata de conversie de la probă la înscriere e una dintre cele mai importante cifre de business și
intră în [E21](E21-raportare-analytics.md).

**Acceptanță:** o probă programată apare în lista profesorului, marcată distinct, și nu generează
factură.

### S4 · Transferuri

Mutarea unui copil în altă grupă, eventual în altă locație, închide înscrierea veche cu motivul
`transfer` și o deschide pe cea nouă, păstrând legătura. Efectul asupra facturii curente e calculat
și afișat înainte de confirmare.

**Acceptanță:** după transfer, istoricul arată ambele perioade, iar factura reflectă corect
schimbarea.

### S5 · Verificări de compatibilitate

La înscriere se verifică: vârsta față de intervalul grupei, cerințele prealabile ale modulului,
suprapunerea cu alte grupe ale aceluiași copil. Avertismente, nu blocaje — adminul poate trece peste,
motivat.

**Acceptanță:** înscrierea unui copil de 7 ani într-o grupă de 11-14 ani cere confirmare explicită.

### S6 · Formarea grupelor

Un ecran care arată cererile neasignate — de pe lista de așteptare și din
[E20](E20-achizitie-lead.md) — grupate pe vârstă, nivel și locație, ca să se vadă când s-au adunat
destui copii pentru o grupă nouă. Ține cont de disponibilitatea profesorilor din
[E09](E09-personal-roluri.md) și de sălile libere.

**Acceptanță:** răspunde la "am destui copii pentru o grupă nouă de Scratch la Titan?" fără muncă
manuală.

## Dependențe

[E08](E08-multi-locatie.md) pentru sală și capacitate, [E09](E09-personal-roluri.md) pentru profesor,
[E10](E10-curriculum-module.md) pentru modul.

## Riscuri

**Lista de așteptare creează o promisiune.** Dacă notificarea nu pleacă sau pleacă târziu, părintele
pierde locul și încrederea. Depinde direct de fiabilitatea din [E17](E17-comunicare-notificari.md).

## Definition of done

Fiecare participare a unui copil la o grupă are perioadă și stare. Capacitatea e respectată.
Transferurile păstrează istoricul.

## Decizii luate

**Lecția de probă e gratuită.** Bariera minimă la intrare, cele mai multe programări.

Costul deciziei e neprezentarea: un loc blocat de cineva care nu mai vine. Două măsuri, care devin
obligatorii tocmai pentru că proba e gratuită:

- **Memento automat cu o zi înainte**, prin [E17](E17-comunicare-notificari.md). E singura măsură
  care reduce vizibil neprezentările când nu există miză financiară.
- **Plafon de probe simultane per grupă**, ca un curs să nu fie deraiat de patru copii noi
  deodată.

**Nu există date istorice de reconstruit** — vezi [E04](E04-migrari-date.md). S1 se simplifică:
`Enrollment` se construiește curat, fără aproximarea înscrierilor vechi din prezențe, iar riscul
menționat mai jos dispare.

## Întrebări deschise

- Cât timp are cineva de pe lista de așteptare să confirme un loc eliberat?
- Se poate înscrie părintele singur din portal, sau rămâne operațiune de admin? Recomand
  auto-înscriere cu confirmare, dar schimbă fluxul.

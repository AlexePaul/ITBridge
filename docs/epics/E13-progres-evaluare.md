# E13 · Progres, evaluare și feedback

**Status:** scos din MVP · **Pistă:** Operațiuni · **Depinde de:** E10, E12 · **Blochează:** —

> **Scos din MVP prin decizie (septembrie 2026).** Nu e o respingere a epicului — argumentul de mai
> jos rămâne în picioare — ci a momentului. Două motive, în ordine:
>
> - **Nu are pe ce sta.** Evaluarea din S1 e pe competențele din [E10](E10-curriculum-module.md),
>   raportul din S3 e „de final de modul", iar modulul nu există: E10 e el însuși scos din MVP. Ce ar
>   rămâne de construit acum e un formular de observații fără nimic de care să le lege.
> - **Locul lui e luat, pentru moment.** Semnalul dintre înscriere și factură — dovada că se predă
>   serios — îl dă azi [E14](E14-proiecte-elevi.md): părintele primește ce a construit copilul, nu o
>   interpretare a ce a construit. E mai puțin decât un raport de progres, dar pleacă deja.
>
> Ce se pierde e scris în „Problemă" și se pierde efectiv: la finalul unui modul, familia decide pe
> amintiri vagi și pe proiecte, nu pe un raport. Se reia odată cu E10, fiindcă atunci are pe ce sta.

## Problemă

Platforma știe dacă un copil a fost prezent. Nu știe dacă a învățat ceva.

Pentru un părinte care plătește 700 de lei pe modul, prezența nu e răspunsul la întrebarea care îl
interesează. Iar pentru obiectivul declarat — să se vadă că se predă serios — o platformă care
raportează doar prezență spune, involuntar, că doar prezența se măsoară.

Astăzi nu există: evaluare, nivel de competență, feedback de la profesor, raport de final de modul,
certificat, sau vreun semnal către părinte între înscriere și factură.

Efectul comercial e direct: momentul în care un părinte decide dacă înscrie copilul și la modulul
următor e finalul modulului curent. Dacă tot ce a primit în trei luni sunt trei facturi, decizia se
ia pe amintiri vagi. Un raport de progres la final e cel mai ieftin instrument de retenție din tot
planul.

## Rezultat

La finalul fiecărui modul, părintele primește un raport concret: ce a învățat copilul, ce a
construit, cum a evoluat, ce urmează. Profesorul îl produce în câteva minute, nu în două ore.

## În scop

- Evaluare pe competențele din [E10](E10-curriculum-module.md).
- Observații de la profesor, per ședință și per modul.
- Raport de final de modul, generat automat.
- Certificat de absolvire.
- Vizualizarea progresului în portalul părintelui.

## În afara scopului

- Note în sens școlar. Nu e o școală cu catalog, iar notarea ar strica relația.
- Proiectele în sine — vezi [E14](E14-proiecte-elevi.md). Se leagă strâns: proiectul e dovada,
  evaluarea e interpretarea.

## Story-uri

### S1 · Evaluare pe competențe

Fiecare competență dintr-un modul primește, la final, un nivel simplu pentru fiecare copil:
`în lucru`, `dobândită`, `stăpânită`. Trei valori, nu zece — o scală fină nu ar fi completată
consecvent.

**Acceptanță:** un profesor evaluează un copil pe tot modulul în sub două minute.

### S2 · Observații

Note libere, per copil: la o ședință, sau la final de modul. Vizibile părintelui doar cele marcate
explicit ca atare; restul rămân interne.

Distincția contează: profesorul trebuie să poată nota "are nevoie de mai multă răbdare la
debugging" pentru el, și separat să scrie ceva pentru părinte.

**Acceptanță:** o notă internă nu apare niciodată în portalul părintelui.

### S3 · Raport de final de modul

Generat automat din ce există deja: prezența din [E12](E12-prezenta-orar.md), competențele din S1,
proiectele din [E14](E14-proiecte-elevi.md), observațiile publice din S2. Profesorul îl revizuiește,
adaugă un paragraf, îl trimite.

**Acceptanță:** raportul se generează cu un click și cere sub cinci minute de completare umană.

### S4 · Certificat

Un PDF cu numele copilului, modulul absolvit, competențele dobândite, perioada, semnătura școlii.
Infrastructura există deja: `apps/api/src/modules/invoice/pdf.service.ts`, cu PDFKit, fonturile Roboto și logo-ul din
`apps/api/src/assets/`. După [E15](E15-pricing-facturare.md) S7, serviciul nu mai generează facturi —
documentele fiscale trec la SmartBill — deci rămâne liber exact pentru documentele de tipul ăsta.

Merită un logo vectorial înainte, altfel certificatul tipărit va arăta pixelat — vezi
[E18](E18-frontend-portal.md).

Copiii țin la certificate mai mult decât se așteaptă adulții, iar părinții le fotografiază și le
pun pe rețele sociale, ceea ce e marketing gratuit și autentic.

**Acceptanță:** certificatul se generează la finalizarea modulului și e descărcabil din portal.

### S5 · Progresul în portal

O pagină pentru fiecare copil: modulele parcurse, competențele dobândite în timp, proiectele,
prezența, ce urmează. Vizuală, nu tabelară.

**Acceptanță:** un părinte deschide pagina și înțelege în zece secunde unde e copilul lui.

## Dependențe

[E10](E10-curriculum-module.md) pentru competențe, [E12](E12-prezenta-orar.md) pentru prezență.

## Riscuri

**Dacă evaluarea cere efort, nu se va face.** Orice depășește câteva minute per copil per modul va
fi completat superficial sau deloc, iar un raport superficial e mai rău decât niciunul. Simplitatea
e cerință funcțională aici, nu preferință.

**Un raport de progres creează așteptări.** Odată trimis pentru un modul, absența lui la modulul
următor e observată. Se pornește doar dacă se poate susține consecvent.

## Definition of done

Fiecare modul încheiat produce un raport trimis părintelui. Profesorii îl completează fără să se
plângă. Părinții îl deschid — măsurat, nu presupus.

## Întrebări deschise

- Trei niveluri de competență sunt suficiente, sau vreți și "a depășit așteptările"?
- Certificatul e pentru fiecare modul, sau doar la finalul unui curs întreg?
- Raportul merge doar pe email, sau și în portal? Recomand ambele, cu emailul ca notificare și
  portalul ca sursă.

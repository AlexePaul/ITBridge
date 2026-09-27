# Versiunile înlocuite ale textelor juridice

Termenii §4.7 promit că versiunea acceptată de o familie „o poți reciti oricând din portal". Cât timp
un document are o singură versiune publicată, pagina lui _este_ textul acceptat. Din clipa în care o
versiune publicată e înlocuită, textul ei stă aici, **neschimbat**, și se citește la
`/versiuni/<document>/<versiune>` — portalul trimite acolo, din „Profil", fiecare familie care a
acceptat-o.

Un fișier pe versiune: `termeni/1.0.md`, `confidentialitate/1.0.md`, `acord-lucrari/1.0.md`.
Politica de cookie-uri nu are dosar: nu o acceptă nimeni și nimic nu consemnează ce versiune a citit
cineva, deci singurul text datorat e cel în vigoare.

**Dosarul e gol cât timp textele sunt ciorne.** O versiune marcată „nepublicată" sau cu un `[[…]]` în
ea n-a ajuns la nicio familie — conturile de pe stage care au acceptat una sunt conturi de probă —,
iar o ciornă n-are ce căuta aici: ar fi servită pe site cu placeholder-ele în ea.

## Procedura

`apps/web/test/legal-versions.spec.ts` o ține; fiecare pas de mai jos e un mesaj al lui, cu
comanda sau valoarea de lipit.

1. **La publicare.** Când un document nu mai e ciornă — nu mai scrie „nepublicată" pe prima linie și
   nu mai are niciun `[[…]]` —, versiunea lui se trece în `PUBLISHED_VERSIONS`
   (`apps/web/shared/legal.ts`), la capăt, cu amprenta textului, pe care testul o tipărește.
2. **Un text publicat nu se schimbă sub același număr** (termenii §18): o corectură, oricât de
   mică, e o versiune nouă. Termenii și politica noi se cer din nou la prima autentificare (E22 S4);
   un acord pentru lucrări rămâne pe versiunea pe care a fost dat, iar cine schimbă textul judecă
   dacă trebuie cerut din nou (`publication-consent.texts.ts`).
3. **La versiunea nouă**, textul vechi se copiază aici, întâi, exact cum a fost publicat:
   `git show HEAD:docs/legal/termeni-si-conditii.md > docs/legal/versiuni/termeni/1.0.md`. Apoi
   versiunea nouă se trece la capătul listei, iar numărul se urcă și în API
   (`LEGAL_DOCUMENT_VERSIONS` sau `PUBLICATION_CONSENT_VERSIONS`), după procedura din
   `legal-documents.ts`.

Ce e aici nu se editează. Amprenta din listă e a textului pe care îl citește familia, nu a
fișierului: o reformatare a Markdown-ului n-o mișcă, dar un cuvânt schimbat, aici sau în documentul
publicat, pică testul.

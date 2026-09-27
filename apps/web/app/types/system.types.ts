export type { SystemNote, SystemNoteCode, SystemNoteLevel, SystemStatus } from "@itbridge/types";

import type { SystemNoteCode, SystemStatus } from "@itbridge/types";
import { countOf } from "~/composables/useRomanianCount";

/** Where a commit is read, from `/admin/sistem` and `/admin/erori`: the repository on GitHub. */
export const commitUrl = (sha: string) => `https://github.com/AlexePaul/ITBridge/commit/${sha}`;

/** The first seven characters, as git and GitHub print a commit. */
export const shortCommit = (sha: string) => sha.slice(0, 7);

/**
 * What each note on `/admin/sistem` says, and where it is fixed. The API names the case; the
 * sentence is the screen's, filled from the facts beside it, like every error code in
 * `useApiError.ts`. A `Record` over the union: a code the API adds without a sentence here fails the
 * typecheck, not the page.
 */
export const SYSTEM_NOTE_TEXT: Record<
  SystemNoteCode,
  (status: SystemStatus) => { title: string; detail: string }
> = {
  SITE_URL_MISSING: (status) => ({
    title: "Linkurile din emailuri duc la site-ul public",
    detail: `SITE_URL nu e setat, deci linkurile de confirmare, de resetare a parolei și de cont duc la ${status.siteUrl}, unde portalul încă nu există. Pe stage: SITE_URL=https://stage.itbridgeschool.com în Parameter Store, apoi un deploy (runbook, 3.8).`,
  }),
  SITE_URL_LOCAL: (status) => ({
    title: "Linkurile din emailuri duc la un calculator local",
    detail: `SITE_URL este ${status.siteUrl}: un link trimis unei familii n-ar duce nicăieri. Pune adresa site-ului (runbook, 3.8).`,
  }),
  PRODUCTION_WITHOUT_MAIL: () => ({
    title: "Mediul spune „production”, dar emailurile sunt oprite",
    detail:
      "Dacă aici e stage-ul, NODE_ENV trebuie să fie „stage” în Parameter Store — cu „production”, regulile producției (SmartBill, seed) se aplică și aici. Dacă e producția, familiile nu primesc niciun email: MAIL_OUTBOX_ENABLED trebuie scos (runbook, 3.8).",
  }),
  MAIL_KEY_MISSING: () => ({
    title: "Emailurile se scriu, dar nu pleacă",
    detail:
      "Coada trimite, dar lipsește MAIL_RESEND_API_KEY sau MAIL_FROM. Mesajele stau în Livrări și pleacă singure când apare cheia (runbook, 3.8).",
  }),
  MAIL_OFF: () => ({
    title: "Emailurile nu pleacă, dinadins",
    detail:
      "MAIL_OUTBOX_ENABLED=false: fiecare mesaj se scrie totuși și se citește în Livrări, cu linkurile din el.",
  }),
  TRANSFER_DETAILS_MISSING: () => ({
    title: "Contul pentru transfer nu e setat",
    detail:
      "Fără SCHOOL_LEGAL_NAME și SCHOOL_IBAN, portalul și emailul facturii trimit familia la birou pentru plată, în loc să tipărească un cont (docs/lansare-platforma.md).",
  }),
  STORAGE_UNREACHABLE: (status) => ({
    title: "Stocarea nu răspunde",
    detail: `Bucket-ul ${status.storage.bucket ?? "(nesetat: AWS_S3_BUCKET)"} nu răspunde, deci PDF-urile facturilor și lucrările copiilor nu se pot citi sau scrie (runbook, 3.7).`,
  }),
  MIGRATIONS_PENDING: (status) => ({
    title: `${countOf(status.migrations.pending.length, "migrare", "migrări")} ${status.migrations.pending.length === 1 ? "n-a" : "n-au"} rulat`,
    detail: `Schema bazei e în urma codului: ${status.migrations.pending.join(", ")}. Deploy-ul le rulează înainte de repornire; pe laptop, pnpm --filter api migration:run.`,
  }),
  SMARTBILL_OFF: () => ({
    title: "SmartBill e oprit",
    detail: "Facturile au PDF-ul platformei, fără număr fiscal, și nimic nu pleacă spre SmartBill.",
  }),
  SMARTBILL_DRAFT: () => ({
    title: "SmartBill primește ciorne",
    detail:
      "Fiecare factură pleacă drept ciornă — fără număr, fără SPV —, iar plățile nu pleacă deloc.",
  }),
  SMARTBILL_LIVE: () => ({
    title: "SmartBill emite facturi fiscale reale",
    detail: "Fiecare factură ia următorul număr din serie și ajunge în SPV.",
  }),
};

/** How the environment reads on the screen. */
export const environmentLabel = (environment: string): string =>
  ({ production: "producție", stage: "stage", development: "dezvoltare", test: "teste" })[
    environment
  ] ?? environment;

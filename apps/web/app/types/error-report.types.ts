export type {
  ClientErrorKind,
  ClientErrorReport,
  ErrorOccurrence,
  ErrorReport,
  ErrorReportState,
  ErrorReportSummary,
  ErrorSource,
} from "@itbridge/types";

import type { ErrorSource } from "@itbridge/types";

/** Romanian labels for the error record — E06 S1. Next to the screen, per the standing rule. */
export const ERROR_SOURCE_LABELS: Record<ErrorSource, string> = {
  request: "Cerere eșuată",
  logged: "Semnalată de server",
  browser: "Ecran în browser",
};

/** Where to start looking, for each: the three are repaired from different ends. */
export const ERROR_SOURCE_HINTS: Record<ErrorSource, string> = {
  request:
    "Un apel către API a răspuns cu 500. Ruta și contul care a apăsat sunt mai jos; stack trace-ul arată fișierul și linia din apps/api.",
  logged:
    "Serverul a scris o eroare fără ca cineva să fi apăsat ceva: un job, coada de emailuri, SmartBill. Originea e numele componentei din apps/api care a scris-o.",
  browser:
    "Un ecran s-a stricat în browserul cuiva autentificat. Originea e pagina și componenta; liniile din stack arată fișierele construite, deci caută după mesaj.",
};

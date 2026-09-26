export type {
  DivergenceReason,
  FiscalDivergenceRow,
  FiscalDivergenceReport,
  MatchConfidence,
  StatementImportResult,
  StatementLineState,
  StatementLineSuggestion,
  StatementLinesPage,
  StatementLineView,
  StatementRowProblem,
} from "@itbridge/types";

import type { DivergenceReason, StatementRowProblem } from "@itbridge/types";

/**
 * What each divergence means, and where it is fixed — E16/S8. Here and not in `@itbridge/types`:
 * the wire carries `'changed_in_smartbill'`, and the sentence belongs next to the screen that says it.
 */
export const DIVERGENCE_REASON_LABELS: Record<DivergenceReason, string> = {
  missing_in_smartbill: "SmartBill nu mai are factura — a fost ștearsă sau anulată acolo.",
  total_differs: "Totalul din SmartBill diferă de cel din platformă.",
  changed_in_smartbill:
    "În SmartBill e încasată altă sumă decât a înregistrat platforma — o încasare adăugată sau ștearsă de mână acolo.",
  reversed_still_recorded:
    "O plată stornată aici e încă încasare în SmartBill — șterge-o din SmartBill.",
  not_recorded: "O plată primită aici n-a ajuns în SmartBill — vezi pagina Plăți.",
};

/** Where a statement line stands, as the tabs name it. */
export const STATEMENT_LINE_STATE_LABELS: Record<
  import("@itbridge/types").StatementLineState,
  string
> = {
  waiting: "De decis",
  matched: "Înregistrate",
  ignored: "Puse deoparte",
};

/** How sure a proposal is — said beside it, so nobody confirms a guess as if it were a reference. */
export const MATCH_CONFIDENCE_LABELS: Record<import("@itbridge/types").MatchConfidence, string> = {
  reference: "după numărul facturii",
  name: "după nume și sumă",
};

/**
 * Why a statement row was not read, in the office's words. The server sends a code: until the QA
 * of 26 September 2026 it sent English sentences ("no amount could be read"), printed as they came.
 */
export const describeUnreadableRow = (
  problem: StatementRowProblem,
  cell: string | null
): string => {
  switch (problem) {
    case "unreadable_date":
      return `„${cell ?? ""}” nu e o dată`;
    case "no_date":
      return "n-are dată — probabil un total sau un sold";
    case "no_amount":
      return "n-are nicio sumă care să poată fi citită";
  }
};

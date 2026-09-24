/**
 * How this backend talks to SmartBill, read from the environment — E16/S0 and S2.
 *
 * **SmartBill has no sandbox.** Every invoice their API issues is a real fiscal document: it takes
 * the next number in the series, and with e-Factura on it leaves for SPV. There is no test account
 * to aim a staging server at. So the switch below is the whole safety story, and its default is the
 * one that sends nothing:
 *
 *  - `off` — nothing leaves the platform. Invoices are issued exactly as before SmartBill, with the
 *    local PDF. The default everywhere: a laptop, CI, the test suites, stage until somebody decides.
 *  - `draft` — every invoice goes to SmartBill with `isDraft: true`. The spec is explicit that a
 *    draft gets **no number** and stays a draft until somebody finalises it by hand in SmartBill
 *    Cloud, so it is not a fiscal document and never reaches SPV. This is the sandbox SmartBill
 *    does not have: the real account, the real payload, the real answers, and nothing to storno.
 *  - `live` — real invoices, and only from a production backend. Refused at boot unless
 *    `NODE_ENV=production` (see `mayIssueFiscalDocuments`) **and** `SMARTBILL_LIVE_DB` names this
 *    database (see `env.validation.ts`), for the reason `SEED_ALLOW_NON_LOCAL` has to name one: a
 *    "yes" left in an environment file would otherwise authorise whatever database it is copied
 *    next to — and stage's database is seed data, whose families would each get a real invoice.
 *    Stage runs as `NODE_ENV=stage`, so the most it can ever send is a draft.
 *
 * Read at call time rather than cached at construction, like `MailService`: a test switches the
 * mode per case, and nothing has to be reasoned about in terms of module load order.
 */

export type SmartBillMode = 'off' | 'draft' | 'live';

export const SMARTBILL_MODES: readonly SmartBillMode[] = ['off', 'draft', 'live'];

/** V1 — "facturare si operatiuni curente", per the spec. V3 is nomenclatures and has no invoices. */
export const SMARTBILL_DEFAULT_BASE_URL = 'https://ws.smartbill.ro/SBORO/api';

/**
 * The unit printed on the invoice line. It has to exist, spelled exactly so, in the account —
 * "`buc` si `BUC` sunt tratate diferit", the spec says — and `buc` is the one every account starts
 * with. `pnpm --filter api smartbill:check` cannot list units, so a school that bills in `luna`
 * sets the variable and finds out on the first draft.
 */
export const DEFAULT_MEASURING_UNIT = 'buc';

export interface SmartBillTax {
    /** Spelled exactly as in the account — `GET /tax` lists them. */
    name: string;
    percentage: number;
}

export interface SmartBillConfig {
    mode: SmartBillMode;
    baseUrl: string;
    /** The e-mail the API token belongs to; the user half of Basic auth. */
    username: string | undefined;
    token: string | undefined;
    /** `companyVatCode`: the school's CIF, exactly as SmartBill Cloud has it. */
    cif: string | undefined;
    /**
     * The invoice series the platform issues on. **It must be the platform's own**: nothing else
     * may issue on it — see `reconcile` in `smartbill.rules.ts` for why a shared series turns a lost
     * answer into a question only a person can settle.
     */
    invoiceSeries: string | undefined;
    measuringUnit: string;
    /** Only when the account has "Foloseste cod produs" on; SmartBill then refuses a line without one. */
    productCode: string | undefined;
    /**
     * `null` for a school that is not a VAT payer, which the spec's example 14 says is a line with no
     * VAT fields at all. Set, the price is sent as VAT-inclusive: the amounts in this platform are
     * what a family pays, not a base that grows on the way to the invoice.
     */
    tax: SmartBillTax | null;
}

function trimmed(value: string | undefined): string | undefined {
    const text = value?.trim();
    return text ? text : undefined;
}

/**
 * Whether this backend may ask SmartBill for a real fiscal invoice: **production, and nowhere
 * else.** Stage and a laptop get as far as `draft`.
 *
 * `SMARTBILL_LIVE_DB` alone does not draw that line. Stage has no SmartBill of its own to point at —
 * there is no sandbox — only the school's, and a stage environment file with `live` and its own
 * database's name in it would pass that check: two SmartBill settings, typed by the same person on
 * the same afternoon, while trying SmartBill out. `NODE_ENV` is not a SmartBill setting; it says
 * what the whole backend is. For stage to issue, somebody would have to declare stage production.
 *
 * Spelled out, never inferred: an unset `NODE_ENV` is a laptop, not a production.
 *
 * `test` passes too, and that is not a hole: under jest `SmartBillService` refuses the production
 * host outright, so the suites exercise `live` against a fake and against nothing else.
 */
export function mayIssueFiscalDocuments(env: Record<string, unknown> = process.env): boolean {
    return env.NODE_ENV === 'production' || env.NODE_ENV === 'test';
}

export function smartBillMode(env: NodeJS.ProcessEnv = process.env): SmartBillMode {
    const raw = trimmed(env.SMARTBILL_MODE);
    return raw && (SMARTBILL_MODES as readonly string[]).includes(raw) ? (raw as SmartBillMode) : 'off';
}

export function smartBillConfig(env: NodeJS.ProcessEnv = process.env): SmartBillConfig {
    const taxName = trimmed(env.SMARTBILL_TAX_NAME);
    const taxPercentage = trimmed(env.SMARTBILL_TAX_PERCENTAGE);

    return {
        mode: smartBillMode(env),
        baseUrl: (trimmed(env.SMARTBILL_BASE_URL) ?? SMARTBILL_DEFAULT_BASE_URL).replace(/\/+$/, ''),
        username: trimmed(env.SMARTBILL_USERNAME),
        token: trimmed(env.SMARTBILL_TOKEN),
        cif: trimmed(env.SMARTBILL_CIF),
        invoiceSeries: trimmed(env.SMARTBILL_INVOICE_SERIES),
        measuringUnit: trimmed(env.SMARTBILL_MEASURING_UNIT) ?? DEFAULT_MEASURING_UNIT,
        productCode: trimmed(env.SMARTBILL_PRODUCT_CODE),
        // Both or neither — `env.validation.ts` refuses one without the other, so a half-set pair
        // here can only be a test setting one of them; treating it as "no VAT" would issue a
        // document with the wrong tax regime, so it is not treated as anything.
        tax: taxName && taxPercentage !== undefined ? { name: taxName, percentage: Number(taxPercentage) } : null,
    };
}

/** What a mode other than `off` cannot work without. Empty means the credentials are all there. */
export function missingSmartBillSettings(config: SmartBillConfig): string[] {
    const missing: string[] = [];
    if (!config.username) missing.push('SMARTBILL_USERNAME');
    if (!config.token) missing.push('SMARTBILL_TOKEN');
    if (!config.cif) missing.push('SMARTBILL_CIF');
    if (!config.invoiceSeries) missing.push('SMARTBILL_INVOICE_SERIES');
    return missing;
}

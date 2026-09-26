/**
 * The family export's coded values, in the words the family reads — E07 S4, the access right.
 *
 * The keys of the document were Romanian from the start, so a family could read it, and its values
 * were the codes the database keeps: APPROVED, succeeded, bank_transfer, regular (QA of 26 September
 * 2026). A copy of your data you cannot read answers the letter of article 15 and not its purpose.
 * A value with no word here passes through as it is: an unknown code printed is better than one
 * silently dropped.
 */
const LABELS = {
    role: { PARENT: 'părinte', ADMIN: 'administrator' },
    approval: { PENDING: 'în așteptare', APPROVED: 'aprobat', REJECTED: 'respins' },
    enrollment: { TRIAL: 'probă', ACTIVE: 'activă', COMPLETED: 'încheiată', WITHDRAWN: 'retrasă', TRANSFERRED: 'mutată în altă grupă' },
    waitlist: {
        WAITING: 'în așteptare',
        OFFERED: 'loc oferit',
        ACCEPTED: 'acceptat',
        DECLINED: 'refuzat',
        EXPIRED: 'expirat',
        CANCELLED: 'anulat',
    },
    attendance: { regular: 'în grupa lui', 'make-up': 'mutat în altă grupă pentru o săptămână' },
    project: { new: 'de verificat', sent: 'trimis', error: 'eroare' },
    invoice: { pending: 'de plată', paid: 'plătită', overdue: 'restantă', waived: 'fără plată' },
    paymentMethod: { cash: 'numerar', bank_transfer: 'transfer bancar' },
    payment: { initiated: 'anunțată', succeeded: 'încasată', failed: 'neintrată', reversed: 'stornată' },
    discount: { fixed: 'sumă fixă (lei)', percent: 'procent' },
    lead: {
        new: 'nouă',
        contacted: 'contactată',
        trial_scheduled: 'probă programată',
        trial_held: 'probă ținută',
        enrolled: 'înscris',
        lost: 'închisă',
    },
    leadSource: {
        trial_form: 'formularul de pe site',
        phone: 'telefon',
        walk_in: 'la birou',
        referral: 'recomandare',
        other: 'altfel',
        google: 'Google',
        facebook: 'Facebook',
        instagram: 'Instagram',
        friend: 'un prieten',
        flyer: 'un pliant',
        passing_by: 'în trecere',
    },
    message: { pending: 'în curs de trimitere', sent: 'trimis', failed: 'netrimis', undeliverable: 'fără adresă la care să plece' },
    consentPurpose: { promotion: 'materialele școlii' },
    consentChannel: { portal: 'din portal', office: 'la birou' },
    document: { terms: 'termenii și condițiile', privacy: 'nota de confidențialitate', unusual_clauses: 'clauzele neuzuale (§14, §15, §18)' },
} as const;

export type ExportLabelKind = keyof typeof LABELS;

/** The word for a coded value, or the value itself when there is none; `null` stays `null`. */
export function exportLabel(kind: ExportLabelKind, value: string): string;
export function exportLabel(kind: ExportLabelKind, value: string | null | undefined): string | null;
export function exportLabel(kind: ExportLabelKind, value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const words: Record<string, string> = LABELS[kind];
    return words[value] ?? value;
}

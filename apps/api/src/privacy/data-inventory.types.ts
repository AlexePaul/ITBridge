/**
 * The vocabulary the inventory is written in — E07 S1.
 *
 * Kept apart from the inventory itself so the table below reads as data rather than as a mix of
 * definitions and rows, and so the renderer that produces `docs/inventar-date.md` imports the
 * labels from one place. The labels are Romanian because they end up in a document a family and a
 * lawyer read; everything around them is English, as the rest of the code is.
 */

/** Whose data a row is about. Export and deletion both start from this. */
export type DataSubject =
    /** A parent, as `Profile` knows them. */
    | 'parent'
    /** A child. The subject of the data even though the parent is the one who supplied it. */
    | 'child'
    /** Whoever the account belongs to — a parent or a member of staff. */
    | 'account-holder'
    /** Nobody: the school's own configuration, schedule or content. */
    | 'none';

/**
 * Why the school is allowed to hold it. GDPR art. 6, in the four forms this platform actually uses.
 *
 * `consent` appears exactly where a refusal changes nothing else: marketing today, publishing a
 * child's work when E07 S2 is built. Anywhere a refusal would end the service, consent would not be
 * freely given and so would not be a valid basis — that is `contract`.
 */
export type LegalBasis = 'contract' | 'legal_obligation' | 'legitimate_interest' | 'consent';

/**
 * Which rule decides how long the row lives.
 *
 * **The numbers are not here.** E22 S3 writes the term, because "how long" is a promise made to a
 * family and belongs in the document the family reads; E07 S4 and E04 S5 execute it. What this
 * column does is group the fields, so that story has to put a number on five rules rather than on
 * two hundred and twenty-one columns.
 */
export type RetentionRule =
    /** Lives as long as the family's account, and goes when the account does. */
    | 'account'
    /** Held because accounting law requires it, for the term that law names. */
    | 'accounting'
    /** Kept only while it is operationally needed, then cleared. */
    | 'operational'
    /** Expires by itself: tokens, confirmations, offers. */
    | 'self-expiring'
    /** Evidence of what staff did; outlives the row it describes on purpose. */
    | 'audit';

/** Who can read it through the application. Not who could read the database. */
export type Audience =
    | 'admin'
    /** The family it is about, through the portal. */
    | 'parent'
    /** The upload agent on the office computer. */
    | 'agent'
    /** Nothing reads it back out: it is written and compared, never returned. */
    | 'nobody';

/** What kind of thing it is, for the privacy note's own grouping. */
export type DataCategory =
    /** Names, dates of birth — who somebody is. */
    | 'identity'
    /** Email, phone, address — how to reach them. */
    | 'contact'
    /** Password and token hashes. Never the secret itself. */
    | 'credential'
    /** Enrolment, attendance, the tie between a child and a class. */
    | 'participation'
    /** Invoices, payments, discounts — what a family owes and has paid. */
    | 'financial'
    /** A child's work, and free text staff wrote about a family. */
    | 'content'
    /** Traces of use: who acted, from what device, when. */
    | 'behavioural';

/** Why a column is not personal data. One of a short list, so the answer stays checkable. */
export type NotPersonalReason =
    /** A surrogate key. Says nothing about anybody on its own. */
    | 'identifier'
    /** When the row was written or last touched. */
    | 'row-timestamp'
    /** The row's own operational state, not a fact about a person. */
    | 'state'
    /** The school's timetable, rooms and capacity. */
    | 'schedule'
    /** The school's own configuration and addresses. */
    | 'config'
    /** Text the school wrote for itself: templates, announcements, period names. */
    | 'school-content'
    /** Plumbing: dedupe keys, attempt counters, hashes of the school's own files. */
    | 'plumbing';

export interface NotPersonalColumn {
    personal: false;
    why: NotPersonalReason;
    /** Only where the answer is not obvious from the name. */
    note?: string;
}

export interface PersonalColumn {
    personal: true;
    /** Whose. A single table can hold both, as `leads` does. */
    about: Exclude<DataSubject, 'none'>;
    category: DataCategory;
    /** In Romanian: it is copied into the privacy note. */
    purpose: string;
    basis: LegalBasis;
    retention: RetentionRule;
    readableBy: Audience[];
    /** Anything a reader would otherwise get wrong. Romanian, same reason. */
    note?: string;
}

export type ColumnClassification = NotPersonalColumn | PersonalColumn;

export interface EntityInventory {
    /** The database table, so the document names what a DBA would recognise. */
    table: string;
    /** In Romanian: one line saying what the table is for. */
    purpose: string;
    subject: DataSubject;
    /**
     * How to walk from a row to the family it concerns, as a property path.
     *
     * This is the column E07 S4 reads: an export has to find every row about one family, and a
     * deletion has to find the same set. `null` only where `subject` is `none`.
     */
    linkedVia: string | null;
    columns: Record<string, ColumnClassification>;
}

export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
    contract: 'Executarea contractului',
    legal_obligation: 'Obligație legală',
    legitimate_interest: 'Interes legitim',
    consent: 'Consimțământ',
};

export const RETENTION_LABELS: Record<RetentionRule, string> = {
    account: 'Cât ține contul familiei (termenul: E22 S3)',
    accounting: 'Termenul contabil legal',
    operational: 'Cât e nevoie operațional',
    'self-expiring': 'Expiră singur',
    audit: 'Evidență; supraviețuiește rândului descris',
};

export const CATEGORY_LABELS: Record<DataCategory, string> = {
    identity: 'Identitate',
    contact: 'Date de contact',
    credential: 'Credențiale',
    participation: 'Participare',
    financial: 'Financiar',
    content: 'Conținut',
    behavioural: 'Urme de utilizare',
};

export const SUBJECT_LABELS: Record<DataSubject, string> = {
    parent: 'Părinte',
    child: 'Copil',
    'account-holder': 'Titularul contului',
    none: '—',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
    admin: 'Admin',
    parent: 'Familia respectivă',
    agent: 'Agentul de încărcare',
    nobody: 'Nimeni (nu se citește înapoi)',
};

export const NOT_PERSONAL_LABELS: Record<NotPersonalReason, string> = {
    identifier: 'identificator surogat',
    'row-timestamp': 'marcaj de timp al rândului',
    state: 'starea rândului',
    schedule: 'orar, sală, capacitate',
    config: 'configurația școlii',
    'school-content': 'text scris de școală',
    plumbing: 'mecanică internă',
};

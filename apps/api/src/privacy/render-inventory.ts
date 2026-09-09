import { DATA_INVENTORY, isPersonal } from './data-inventory';
import {
    AUDIENCE_LABELS,
    CATEGORY_LABELS,
    LEGAL_BASIS_LABELS,
    NOT_PERSONAL_LABELS,
    RETENTION_LABELS,
    SUBJECT_LABELS,
    type NotPersonalReason,
} from './data-inventory.types';

/**
 * Turns the inventory into the document E22 S2 reads — E07 S1.
 *
 * Pure, and separate from the script that writes the file, so the freshness check in
 * `data-inventory.spec.ts` can render and compare without touching the disk twice. The rule the
 * epic sets is that the privacy note is written **from** the inventory rather than beside it: two
 * tables kept by hand diverge, and the one under a family's eyes is always the stale one.
 */

/** Escapes a cell so a pipe in a purpose cannot silently end the column. */
function cell(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function heading(): string[] {
    return [
        '# Inventarul datelor personale',
        '',
        '> **Generat din cod. Nu se editează de mână.**',
        '> Sursa e `apps/api/src/privacy/data-inventory.ts`; fișierul ăsta se reface cu',
        '> `pnpm --filter api inventory:render`, iar `data-inventory.spec.ts` pică dacă cele două nu mai spun',
        '> același lucru.',
        '',
        'E07 S1. Tabelul răspunde, pentru fiecare câmp: unde stă, de ce, pe ce temei legal, cât se',
        'păstrează și cine îl poate vedea. **Nota de confidențialitate din E22 S2 se scrie din el**, nu',
        'alături de el.',
        '',
        'Trei lucruri de citit înainte de tabele:',
        '',
        '- **Ce face o coloană personală e că poartă un fapt despre om, nu că îi scrie numele.** Suma',
        '  unei facturi nu e un număr în abstract, e ce datorează *familia asta*; regula din GDPR e',
        '  „informație care *privește* o persoană identificabilă", nu „informație care o identifică".',
        '  Ce rămâne în afară sunt cheile surogat, marcajele de timp ale rândului și mecanica internă:',
        '  descriu rândul, nu persoana.',
        '- **Ștergerea urmează rândul, nu coloana.** Ce pleacă odată cu familia decide tabelul de mai',
        '  jos, prin `linkedVia`, nu tabelul de aici: un `createdAt` de pe rândul unui copil se șterge',
        '  cu el, chiar dacă nu e trecut ca dată personală. Cele două tabele răspund la întrebări',
        '  diferite — primul la „ce scrie în nota de confidențialitate", al doilea la „ce dispare".',
        '- **Termenele nu sunt aici.** „Cât se păstrează" grupează câmpurile în cinci reguli; numărul pe',
        '  care îl pune fiecare regulă e scris în E22 S3, fiindcă e o promisiune făcută familiei și',
        '  trăiește în documentul pe care ea îl citește. E07 S4 și E04 S5 îl execută.',
        '',
    ];
}

function summary(): string[] {
    const entities = Object.values(DATA_INVENTORY);
    const columns = entities.flatMap((entity) => Object.values(entity.columns));
    const personal = columns.filter(isPersonal);
    const withSubject = entities.filter((entity) => entity.subject !== 'none');

    return [
        '## Pe scurt',
        '',
        `- **${entities.length} tabele**, cu **${columns.length} coloane** clasificate — toate, fiindcă garda cere o clasificare, nu o listă.`,
        `- **${personal.length} coloane sunt date personale**, în **${withSubject.length} tabele**.`,
        `- Restul de **${columns.length - personal.length}** sunt identificatori, marcaje de timp, orarul școlii sau mecanică internă; motivul e scris la fiecare.`,
        '',
    ];
}

function personalTable(): string[] {
    const rows = Object.entries(DATA_INVENTORY).flatMap(([, entity]) =>
        Object.entries(entity.columns)
            .filter(([, classification]) => isPersonal(classification))
            .map(([column, classification]) => {
                if (!isPersonal(classification)) throw new Error('unreachable');
                return [
                    `\`${entity.table}.${column}\``,
                    SUBJECT_LABELS[classification.about],
                    CATEGORY_LABELS[classification.category],
                    cell(classification.purpose),
                    LEGAL_BASIS_LABELS[classification.basis],
                    RETENTION_LABELS[classification.retention],
                    classification.readableBy.map((audience) => AUDIENCE_LABELS[audience]).join(', '),
                ];
            }),
    );

    return [
        '## Datele personale, câmp cu câmp',
        '',
        '| Câmp | Despre | Categorie | De ce | Temei | Cât | Cine vede |',
        '| ---- | ------ | --------- | ----- | ----- | --- | --------- |',
        ...rows.map((row) => `| ${row.join(' | ')} |`),
        '',
    ];
}

function notesSection(): string[] {
    const notes = Object.entries(DATA_INVENTORY).flatMap(([, entity]) =>
        Object.entries(entity.columns)
            .filter(([, classification]) => classification.note)
            .map(([column, classification]) => `- **\`${entity.table}.${column}\`** — ${cell(classification.note ?? '')}`),
    );

    return ['## Ce se ratează ușor', '', ...notes, ''];
}

function reachabilityTable(): string[] {
    const rows = Object.entries(DATA_INVENTORY)
        .filter(([, entity]) => entity.subject !== 'none')
        .map(([, entity]) => [
            `\`${entity.table}\``,
            SUBJECT_LABELS[entity.subject],
            entity.linkedVia === null ? '**nu se poate ajunge prin relații**' : `\`${entity.linkedVia}\``,
            cell(entity.purpose),
        ]);

    return [
        '## Unde stau rândurile unei familii',
        '',
        'Coloana din mijloc e drumul pe care îl parcurge E07 S4: un export trebuie să găsească fiecare',
        'rând despre o familie, iar o ștergere aceeași mulțime. Cele trei rânduri fără drum sunt scrise',
        'așa dinadins, iar motivul e la fiecare în „Ce se ratează ușor".',
        '',
        '| Tabel | Despre | Cum se ajunge la familie | Ce ține |',
        '| ----- | ------ | ------------------------ | ------- |',
        ...rows.map((row) => `| ${row.join(' | ')} |`),
        '',
    ];
}

function notPersonalTable(): string[] {
    const byReason = new Map<NotPersonalReason, string[]>();
    for (const entity of Object.values(DATA_INVENTORY)) {
        for (const [column, classification] of Object.entries(entity.columns)) {
            if (isPersonal(classification)) continue;
            const list = byReason.get(classification.why) ?? [];
            list.push(`\`${entity.table}.${column}\``);
            byReason.set(classification.why, list);
        }
    }

    const rows = [...byReason.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([reason, columns]) => [NOT_PERSONAL_LABELS[reason], String(columns.length), columns.join(', ')]);

    return [
        '## Ce nu e dată personală, și de ce',
        '',
        '| Motiv | Câte | Coloane |',
        '| ----- | ---- | ------- |',
        ...rows.map((row) => `| ${row.join(' | ')} |`),
        '',
    ];
}

export function renderInventory(): string {
    return [...heading(), ...summary(), ...personalTable(), ...reachabilityTable(), ...notPersonalTable(), ...notesSection()].join('\n');
}

import { EarlySignals } from './early-signals.service';

/**
 * The Monday message about the early signals — E21/S7 — as text.
 *
 * Romanian, because it is read by a person at the school. Separate from the job so the wording can
 * be asserted without a queue behind it, exactly as `composeUnmarkedReminder` and the lead digest
 * are kept apart from theirs.
 */

export interface ComposedSignalsDigest {
    subject: string;
    bodyText: string;
}

/** True when there is nothing to say — and then nothing is sent. */
export function signalsDigestIsEmpty(signals: EarlySignals): boolean {
    return signals.totals.all === 0;
}

export function composeSignalsDigest(signals: EarlySignals): ComposedSignalsDigest {
    const lines = ['Bună!', ''];

    if (signals.children.length > 0) {
        lines.push(`Copii care au lipsit de ${signals.thresholds.childAbsenceStreak} ori la rând sau mai mult (${signals.children.length}):`);
        for (const child of signals.children) {
            const announced = child.announced > 0 ? `, ${child.announced} ${child.announced === 1 ? 'anunțată' : 'anunțate'}` : '';
            const family = child.parentName ? ` · ${child.parentName}${child.phone ? `, ${child.phone}` : ''}` : '';
            lines.push(`- ${child.childName} (${child.groupName}) — ${child.streak} absențe din ${romanianDay(child.since)}${announced}${family}`);
        }
        lines.push('');
    }

    if (signals.groups.length > 0) {
        lines.push(`Grupe cu prezența în scădere (${signals.groups.length}):`);
        for (const group of signals.groups) {
            lines.push(
                `- ${group.groupName} (${group.locationName}) — de la ${percent(group.previousRate)} la ${percent(group.recentRate)} pe ultimele ${signals.thresholds.groupAttendanceWindow} ședințe`,
            );
        }
        lines.push('');
    }

    if (signals.families.length > 0) {
        lines.push(`Familii cu ${signals.thresholds.familyOverdueInvoices} sau mai multe facturi restante (${signals.families.length}):`);
        for (const family of signals.families) {
            lines.push(
                `- ${family.parentName} — ${family.invoices} facturi, ${lei(family.outstanding)}, cea mai veche de ${family.oldestDaysOverdue} ${family.oldestDaysOverdue === 1 ? 'zi' : 'zile'}`,
            );
        }
        lines.push('');
    }

    if (signals.underfilled.length > 0) {
        lines.push(`Grupe sub pragul de ocupare de ${percent(signals.thresholds.occupancy)} (${signals.underfilled.length}):`);
        for (const group of signals.underfilled) {
            lines.push(`- ${group.groupName} (${group.locationName}) — ${group.taken} din ${group.capacity} locuri (${percent(group.fillRate)})`);
        }
        lines.push('');
    }

    lines.push('Detaliile și istoricul, pe săptămâni: /admin/rapoarte?tab=semnale');
    lines.push('');
    lines.push('Mesaj automat, trimis luni dimineața doar când există ceva de semnalat. Pragurile sunt propuneri,');
    lines.push('scrise în signals.rules.ts, nu decizii.');

    const parts = [
        count(signals.children.length, 'copil', 'copii'),
        count(signals.groups.length, 'grupă', 'grupe'),
        count(signals.families.length, 'familie', 'familii'),
        count(signals.underfilled.length, 'grupă sub prag', 'grupe sub prag'),
    ].filter((part) => part !== null);

    return { subject: `Semnale timpurii, ${romanianDay(signals.asOf)}: ${parts.join(', ')}`, bodyText: lines.join('\n') };
}

/** `2026-03-30` → `30.03.2026`, the shape the office reminders already use. */
function romanianDay(iso: string): string {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}

function percent(rate: number): string {
    return `${Math.round(rate * 100)}%`;
}

function lei(amount: number): string {
    return `${amount.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} lei`;
}

/** Romanian counts the noun — and from twenty up it wants `de` before it. `null` when there are none. */
function count(value: number, singular: string, plural: string): string | null {
    if (value === 0) return null;
    if (value === 1) return `1 ${singular}`;
    return value < 20 ? `${value} ${plural}` : `${value} de ${plural}`;
}

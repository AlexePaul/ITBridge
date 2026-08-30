/**
 * The offer mail — E11/S3.
 *
 * A plain function, exported apart from the service that queues it, so the wording can be asserted
 * without a queue or a database behind it. Romanian, because a parent reads it.
 *
 * The deadline is in the message on purpose. S3's risk is that the waiting list "creates a
 * promise": a family that loses a seat because nobody told them there was a clock has been treated
 * worse than one that was never on the list.
 */
export function composeWaitlistOffer(childName: string, groupName: string, respondBy: Date): { subject: string; bodyText: string } {
    const bodyText = [
        'Bună!',
        '',
        `S-a eliberat un loc în grupa ${groupName}, iar ${childName} este primul pe lista de așteptare.`,
        '',
        `Te rugăm să ne confirmi până pe ${formatRomanianDateTime(respondBy)}. După data asta oferim locul`,
        'următoarei familii de pe listă.',
        '',
        'Răspunde la acest email sau sună-ne, și îl înscriem.',
        '',
        'Cu drag,',
        'Echipa IT Bridge School',
    ].join('\n');

    return { subject: `S-a eliberat un loc în grupa ${groupName}`, bodyText };
}

/** "12.09.2026, ora 14:00" — the deadline as somebody would say it out loud. */
function formatRomanianDateTime(date: Date): string {
    const parts = new Intl.DateTimeFormat('ro-RO', {
        timeZone: 'Europe/Bucharest',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')}.${get('month')}.${get('year')}, ora ${get('hour')}:${get('minute')}`;
}

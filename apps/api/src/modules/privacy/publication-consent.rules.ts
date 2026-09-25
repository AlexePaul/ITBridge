import { ConsentChannel } from 'src/enum/consent-channel.enum';
import { PublicationPurpose } from 'src/enum/publication-purpose.enum';
import { PUBLICATION_PURPOSES } from './publication-consent.texts';

/** As much of a `PublicationConsent` row as the rules need. */
export interface ConsentRowLike {
    id: number;
    purpose: PublicationPurpose;
    textVersion: string;
    grantedAt: Date;
    grantedVia: ConsentChannel;
    revokedAt: Date | null;
    revokedVia: ConsentChannel | null;
}

export interface PurposeState<Row extends ConsentRowLike> {
    purpose: PublicationPurpose;
    /** The consent in force, or null: never given, or given and taken back. */
    inForce: Row | null;
    /** Every consent for this purpose, newest first — the one in force included. */
    history: Row[];
}

/**
 * One child's consents, one entry per purpose — E07 S2.
 *
 * Every purpose appears whether or not a row exists for it. A screen that listed only the purposes
 * with rows could not offer the first consent, and an export that did would read as though the
 * question had never been asked, when the answer is "no".
 *
 * "In force" is the row with no `revokedAt`. The partial unique index guarantees there is at most
 * one; this does not re-check it, it reads it.
 */
export function consentsByPurpose<Row extends ConsentRowLike>(rows: readonly Row[]): PurposeState<Row>[] {
    return PUBLICATION_PURPOSES.map((purpose) => {
        const history = rows.filter((row) => row.purpose === purpose).sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime() || b.id - a.id);
        return { purpose, inForce: history.find((row) => row.revokedAt === null) ?? null, history };
    });
}

/**
 * Who wrote the change down, in the words of the confirmation the family receives.
 *
 * The family is told either way. When it was them, the email is the receipt they can keep. When it
 * was the office, the email is also the one chance to notice a consent typed in against the wrong
 * child — and a wrong "yes" here is a child's work on a public page.
 */
export function recordedByInWords(channel: ConsentChannel): string {
    return channel === ConsentChannel.PORTAL ? 'din contul tău' : 'de birou, la cererea ta';
}

/** The same fact, as the office reads it in the notice that something has to come down. */
export function recordedByForOffice(channel: ConsentChannel): string {
    return channel === ConsentChannel.PORTAL ? 'din portal, de familie' : 'de birou';
}

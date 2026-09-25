import { ConsentChannel } from 'src/enum/consent-channel.enum';
import { PublicationPurpose } from 'src/enum/publication-purpose.enum';
import { consentsByPurpose, recordedByForOffice, recordedByInWords, type ConsentRowLike } from './publication-consent.rules';

const row = (overrides: Partial<ConsentRowLike> & Pick<ConsentRowLike, 'id'>): ConsentRowLike => ({
    purpose: PublicationPurpose.PROMOTION,
    textVersion: '0.1',
    grantedAt: new Date('2026-09-01T10:00:00Z'),
    grantedVia: ConsentChannel.PORTAL,
    revokedAt: null,
    revokedVia: null,
    ...overrides,
});

describe('consentsByPurpose', () => {
    it('answers every purpose, including one nobody was ever asked about', () => {
        expect(consentsByPurpose([])).toEqual([{ purpose: PublicationPurpose.PROMOTION, inForce: null, history: [] }]);
    });

    it('names the row without a withdrawal as the one in force', () => {
        const revoked = row({ id: 1, revokedAt: new Date('2026-09-05T10:00:00Z'), revokedVia: ConsentChannel.OFFICE });
        const current = row({ id: 2, grantedAt: new Date('2026-09-10T10:00:00Z') });

        const [promotion] = consentsByPurpose([revoked, current]);

        expect(promotion.inForce).toBe(current);
    });

    it('has nothing in force once the only consent was taken back, and keeps it in the history', () => {
        const revoked = row({ id: 1, revokedAt: new Date('2026-09-05T10:00:00Z'), revokedVia: ConsentChannel.PORTAL });

        const [promotion] = consentsByPurpose([revoked]);

        expect(promotion.inForce).toBeNull();
        expect(promotion.history).toEqual([revoked]);
    });

    it('orders the history newest first, whatever order the rows arrived in', () => {
        const first = row({ id: 1, grantedAt: new Date('2026-09-01T10:00:00Z'), revokedAt: new Date('2026-09-02T10:00:00Z') });
        const second = row({ id: 2, grantedAt: new Date('2026-09-03T10:00:00Z'), revokedAt: new Date('2026-09-04T10:00:00Z') });
        const third = row({ id: 3, grantedAt: new Date('2026-09-05T10:00:00Z') });

        const [promotion] = consentsByPurpose([second, third, first]);

        expect(promotion.history.map((consent) => consent.id)).toEqual([3, 2, 1]);
    });

    it('breaks a tie on the same instant by id, so two reads cannot disagree', () => {
        const at = new Date('2026-09-01T10:00:00Z');
        const older = row({ id: 7, grantedAt: at, revokedAt: at });
        const newer = row({ id: 8, grantedAt: at });

        expect(consentsByPurpose([older, newer])[0].history.map((consent) => consent.id)).toEqual([8, 7]);
    });
});

describe('who wrote it down, in words', () => {
    it('tells the family whether it was them or the office', () => {
        expect(recordedByInWords(ConsentChannel.PORTAL)).toBe('din contul tău');
        expect(recordedByInWords(ConsentChannel.OFFICE)).toBe('de birou, la cererea ta');
    });

    it('tells the office the same fact from its side', () => {
        expect(recordedByForOffice(ConsentChannel.PORTAL)).toBe('din portal, de familie');
        expect(recordedByForOffice(ConsentChannel.OFFICE)).toBe('de birou');
    });
});

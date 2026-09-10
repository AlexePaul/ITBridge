import { Test, TestingModule } from '@nestjs/testing';
import { UnsubscribeService } from './unsubscribe.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { Profile } from 'src/entities/profile.entity';
import { createMockEntityManager, MockEntityManager, provideMockDataSource } from 'src/testing/repository.mock';

/**
 * The link at the foot of a marketing message — E17 S4.
 *
 * Everything worth asserting here is about how *little* it does. It is public, the token travels
 * in an e-mail that can be forwarded or sit in a mailbox for a year, and the only thing standing
 * between that and a stranger changing a family's settings is that there is nothing else to change.
 */
describe('UnsubscribeService', () => {
    let service: UnsubscribeService;
    let manager: MockEntityManager;
    let audit: { recordPersonalDataChange: jest.Mock };

    beforeEach(async () => {
        manager = createMockEntityManager();
        manager.findOne = jest.fn();
        audit = { recordPersonalDataChange: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [UnsubscribeService, provideMockDataSource(manager), { provide: AuditService, useValue: audit }],
        }).compile();

        service = module.get(UnsubscribeService);
    });

    it('turns marketing off for the family the token names', async () => {
        manager.findOne!.mockResolvedValue({ id: 7, marketingOptIn: true });

        await service.unsubscribe('un-jeton');

        expect(manager.update).toHaveBeenCalledWith(Profile, { id: 7 }, { marketingOptIn: false });
    });

    it('finds the family by the token and nothing else', async () => {
        manager.findOne!.mockResolvedValue({ id: 7, marketingOptIn: true });

        await service.unsubscribe('un-jeton');

        expect(manager.findOne).toHaveBeenCalledWith(Profile, expect.objectContaining({ where: { unsubscribeToken: 'un-jeton' } }));
    });

    it('writes nothing for a token that names nobody', async () => {
        manager.findOne!.mockResolvedValue(null);

        await service.unsubscribe('inventat');

        expect(manager.update).not.toHaveBeenCalled();
        expect(audit.recordPersonalDataChange).not.toHaveBeenCalled();
    });

    it('never throws on an unknown token — the caller must not be able to tell', async () => {
        manager.findOne!.mockResolvedValue(null);

        // A rejection here would come back as a different status code, and the difference is an
        // oracle: post tokens until one answers differently and you have found a real family.
        await expect(service.unsubscribe('inventat')).resolves.toBeUndefined();
    });

    it('is idempotent — a second click writes nothing and is not an error', async () => {
        manager.findOne!.mockResolvedValue({ id: 7, marketingOptIn: false });

        await service.unsubscribe('un-jeton');

        expect(manager.update).not.toHaveBeenCalled();
        // And no journal entry: the log is for things that changed (E07 S3).
        expect(audit.recordPersonalDataChange).not.toHaveBeenCalled();
    });

    it('leaves a trail, with the field name and no value', async () => {
        manager.findOne!.mockResolvedValue({ id: 7, marketingOptIn: true });

        await service.unsubscribe('un-jeton');

        expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
            expect.objectContaining({
                entityType: 'Profile',
                entityId: 7,
                fields: ['marketingOptIn'],
                // Nobody at the school pressed anything. Inventing an actor would be worse than
                // saying so — see `SYSTEM_ACTOR`.
                actor: { userId: null, username: null },
            }),
            manager,
        );
    });

    it('writes the trail through the same transaction as the change', async () => {
        manager.findOne!.mockResolvedValue({ id: 7, marketingOptIn: true });

        await service.unsubscribe('un-jeton');

        // E07 S3's rule: a trail that survives a rolled-back change describes something that did
        // not happen. `AuditService` demands the manager; this asserts it gets the right one.
        expect(audit.recordPersonalDataChange.mock.calls[0][1]).toBe(manager);
    });

    it('does nothing at all on an empty token', async () => {
        await service.unsubscribe('');

        expect(manager.findOne).not.toHaveBeenCalled();
    });
});

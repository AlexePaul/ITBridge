import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChildService } from './child.service';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Group } from 'src/entities/group.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ChildService', () => {
    let service: ChildService;
    let childRepo: MockRepository;
    let profileRepo: MockRepository;
    let groupRepo: MockRepository;

    /** Copil al părintelui cu contul `ownerUserId`. */
    const childOwnedBy = (ownerUserId: number) => ({
        id: 1,
        parent: { id: 10, user: { id: ownerUserId } },
    });

    beforeEach(async () => {
        childRepo = createMockRepository();
        profileRepo = createMockRepository();
        groupRepo = createMockRepository();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChildService,
                provideMockRepository(Child, childRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Group, groupRepo),
            ],
        }).compile();

        service = module.get(ChildService);
    });

    describe('createChild', () => {
        it('lasă adminul să creeze un copil pentru orice părinte', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            childRepo.save!.mockResolvedValue({ id: 1 });

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.ADMIN, 999)).resolves.toEqual({
                id: 1,
            });
        });

        it('lasă părintele să creeze un copil pentru profilul propriu', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            childRepo.save!.mockResolvedValue({ id: 1 });

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).resolves.toEqual({
                id: 1,
            });
        });

        it('interzice părintelui să creeze un copil pentru alt profil', async () => {
            // Profilul utilizatorului autentificat e 10, dar cererea vizează 11.
            profileRepo.findOne!.mockResolvedValue({ id: 10 });

            await expect(service.createChild({ parentId: 11, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).rejects.toThrow(
                ForbiddenException,
            );
            expect(childRepo.save).not.toHaveBeenCalled();
        });

        it('interzice unui utilizator fără profil să creeze copii', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).rejects.toThrow(
                ForbiddenException,
            );
        });
    });

    describe('findChildren', () => {
        it('nu restrânge nimic pentru ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({}, Role.ADMIN, 42);

            expect(qb.andWhereCalls.some(([c]) => c.includes('user.id'))).toBe(false);
        });

        it('restrânge la utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({}, Role.PARENT, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
        });

        it('un PARENT nu poate cere copiii altui părinte prin filtru', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({ parentId: 999 }, Role.PARENT, 42);

            // Filtrul cerut se adaugă, dar restrângerea pe utilizator rămâne — deci intersecția
            // e goală, nu datele altcuiva.
            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
        });
    });

    describe('updateChild', () => {
        it('lasă părintele să-și modifice propriul copil', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            childRepo.save!.mockImplementation((c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it('interzice modificarea copilului altui părinte', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5)).rejects.toThrow(ForbiddenException);
            expect(childRepo.save).not.toHaveBeenCalled();
        });

        it('lasă adminul să modifice orice copil', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));
            childRepo.save!.mockImplementation((c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.ADMIN, 5)).resolves.toBeDefined();
        });

        it('respinge un copil inexistent', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateChild(99, {}, Role.ADMIN, 5)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteChild', () => {
        it('interzice ștergerea copilului altui părinte', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.deleteChild(1, Role.PARENT, 5)).rejects.toThrow(ForbiddenException);
            expect(childRepo.delete).not.toHaveBeenCalled();
        });

        it('lasă părintele să-și șteargă propriul copil', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));

            await expect(service.deleteChild(1, Role.PARENT, 5)).resolves.toMatchObject({ message: expect.any(String) });
            expect(childRepo.delete).toHaveBeenCalledWith(1);
        });
    });
});

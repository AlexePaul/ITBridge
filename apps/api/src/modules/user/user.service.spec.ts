import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from 'src/entities/user.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('UserService', () => {
    let service: UserService;
    let userRepo: MockRepository;

    beforeEach(async () => {
        userRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService, provideMockRepository(User, userRepo)],
        }).compile();
        service = module.get(UserService);
    });

    it('getUserById rejects a user that does not exist', async () => {
        userRepo.findOne!.mockResolvedValue(null);
        await expect(service.getUserById(99)).rejects.toThrow(NotFoundException);
    });

    it('updateUser rejects a taken username without writing anything', async () => {
        userRepo.findOne!.mockResolvedValue({ id: 2, username: 'ana' });

        await expect(service.updateUser(1, { username: 'ana' })).rejects.toThrow(ConflictException);
        expect(userRepo.update).not.toHaveBeenCalled();
    });

    it('updateUser writes when the username is free', async () => {
        userRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1, username: 'ana-noua' });

        await expect(service.updateUser(1, { username: 'ana-noua' })).resolves.toMatchObject({ username: 'ana-noua' });
        expect(userRepo.update).toHaveBeenCalledWith(1, { username: 'ana-noua' });
    });

    it('updateUser rejects when the user disappears between write and re-read', async () => {
        userRepo.findOne!.mockResolvedValue(null);
        await expect(service.updateUser(1, { role: 'ADMIN' } as never)).rejects.toThrow(NotFoundException);
    });

    it('getUsersWithoutProfile asks the database rather than filtering in memory', async () => {
        const qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
        userRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getUsersWithoutProfile();

        expect(qb.getMany).toHaveBeenCalled();
    });

    it('getUsersWithoutProfile uses NOT EXISTS, never NOT IN', async () => {
        // `profile.user_id` is nullable, and `x NOT IN (1, 2, NULL)` is NULL rather than true in
        // SQL - so with a single account-less profile in the table the endpoint returned an empty
        // list, always and silently. It backs the admin flow for linking an account to a profile,
        // so it came up empty exactly when it mattered.
        const qb = {
            where: jest.fn().mockReturnThis(),
            subQuery: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('(SELECT 1 FROM profiles profile WHERE profile.user_id = user.id)'),
            getMany: jest.fn().mockResolvedValue([]),
        };
        userRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getUsersWithoutProfile();

        const clause = (qb.where.mock.calls[0][0] as (b: typeof qb) => string)(qb);
        expect(clause).toContain('NOT EXISTS');
        expect(clause).not.toContain('NOT IN');
    });
});

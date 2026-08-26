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

    it('getUsersWithoutProfile excludes users who already have a profile', async () => {
        const sub = { select: jest.fn().mockReturnThis(), from: jest.fn().mockReturnThis(), getQuery: jest.fn().mockReturnValue('SUB') };
        const qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
        Object.defineProperty(userRepo, 'manager', { value: { createQueryBuilder: jest.fn().mockReturnValue(sub) }, configurable: true });
        userRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getUsersWithoutProfile();

        expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('NOT IN'));
    });
});

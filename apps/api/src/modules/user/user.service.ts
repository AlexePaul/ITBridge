import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import { UpdateUserDto } from './dto/updateUser.dto';

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {}

    async getAllUsers(): Promise<User[]> {
        return this.userRepository.find();
    }

    /**
     * Accounts that have no profile attached yet — the other half of the flow where an admin creates
     * a profile without an account and links the two later.
     *
     * This used to use `NOT IN` over a subquery selecting `profile.user_id`. That column is nullable,
     * and in SQL `x NOT IN (1, 2, NULL)` evaluates to NULL rather than true, so the moment a single
     * profile existed without an account the endpoint returned an empty list — always, and silently.
     * `NOT EXISTS` has no such behaviour with NULLs.
     */
    async getUsersWithoutProfile(): Promise<User[]> {
        return this.userRepository
            .createQueryBuilder('user')
            .where((qb) => {
                const subQuery = qb.subQuery().select('1').from('profiles', 'profile').where('profile.user_id = user.id').getQuery();
                return `NOT EXISTS ${subQuery}`;
            })
            .getMany();
    }

    async getUserById(id: number): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id } });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
        if (updateUserDto.username) {
            const user = await this.userRepository.findOne({
                where: { username: updateUserDto.username },
            });

            if (user) throw new ConflictException('Username already in use');
        }

        try {
            await this.userRepository.update(id, updateUserDto);
        } catch (error) {
            if (error instanceof Error && error.name === 'EntityNotFoundError') {
                throw new NotFoundException('User not found');
            }

            throw error;
        }

        const updatedUser = await this.userRepository.findOne({
            where: { id },
        });

        if (!updatedUser) {
            throw new NotFoundException('User not found after update');
        }

        return updatedUser;
    }

    async deleteUser(id: number) {
        const deleteResult = await this.userRepository.delete(id);

        if (deleteResult.affected === 0) {
            throw new NotFoundException('User not found');
        }
        return { message: 'User deleted successfully' };
    }
}

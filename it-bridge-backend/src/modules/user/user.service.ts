import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository, IsNull } from 'typeorm';
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

    async getUsersWithoutProfile(): Promise<User[]> {
        const subQuery = this.userRepository
            .manager
            .createQueryBuilder()
            .select('profile.user_id')
            .from('profiles', 'profile');

        return this.userRepository
            .createQueryBuilder('user')
            .where(`user.id NOT IN (${subQuery.getQuery()})`)
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
            if (error.name === 'EntityNotFoundError') {
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

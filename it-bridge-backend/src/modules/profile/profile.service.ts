import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile } from 'src/entities/profile.entity';
import { CreateProfileDto } from './dto/createProfile.dto';
import { User } from 'src/entities/user.entity';

@Injectable()
export class ProfileService {
    constructor(@InjectRepository(Profile) private readonly profileRepository) {}

    async createProfile(userId: number, createProfileDto: CreateProfileDto) {
        if (!userId) {
            throw new UnauthorizedException('User ID is required to create profile');
        }

        const existingProfile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        if (existingProfile) {
            throw new ConflictException('Profile for this user already exists');
        }

        const user = { id: userId } as User;
        let profile = this.profileRepository.create(createProfileDto);
        profile.user = user;
        profile = await this.profileRepository.save(profile);
        return {
            message: 'Profile created successfully',
            profile,
        };
    }

    // maybe i should reuse the createProfile function here but... oh well
    async createProfileAdmin(createProfileDto: CreateProfileDto) {
        const existingProfile = await this.profileRepository.findOne({
            where: [{ email: createProfileDto.email }, { phone: createProfileDto.phone }],
        });
        if (existingProfile) {
            throw new ConflictException('Profile with provided details already exists');
        }

        let profile = this.profileRepository.create(createProfileDto);
        profile = await this.profileRepository.save(profile);
        return {
            message: 'Profile created successfully',
            profile,
        };
    }

    async getProfileByUserId(userId: number) {
        const profile = await this.profileRepository.findOne({
            where: { user: { id: userId } },
            relations: ['children'],
        });
        if (!profile) {
            throw new NotFoundException('Profile not found for the user');
        }
        console.log("Retrieved profile's children:", profile.children);
        return profile;
    }

    async updateProfile(id: number, updateProfileDto: CreateProfileDto, type?: string) {
        var profile;
        if (!type) {
            profile = await this.profileRepository.findOne({ where: { user: { id: id } } });
            if (!profile) {
                throw new NotFoundException('Profile not found for the user');
            }
        } else {
            profile = await this.profileRepository.findOne({ where: { id: id } });
            if (!profile) {
                throw new NotFoundException('Profile not found');
            }
        }
        Object.assign(profile, updateProfileDto);
        await this.profileRepository.save(profile);
        return {
            message: 'Profile updated successfully',
            profile,
        };
    }

    async findProfile(filters: any) {
        const queryBuilder = this.profileRepository.createQueryBuilder('profile');

        if (filters.email) {
            queryBuilder.andWhere('profile.email = :email', { email: filters.email });
        }
        if (filters.phone) {
            queryBuilder.andWhere('profile.phone = :phone', { phone: filters.phone });
        }
        if (filters.firstName) {
            queryBuilder.andWhere('profile.firstName = :firstName', { firstName: filters.firstName });
        }
        if (filters.lastName) {
            queryBuilder.andWhere('profile.lastName = :lastName', { lastName: filters.lastName });
        }
        if (filters.id) {
            queryBuilder.andWhere('profile.id = :id', { id: filters.id });
        }

        const profiles = await queryBuilder.getMany();
        return profiles;
    }
}

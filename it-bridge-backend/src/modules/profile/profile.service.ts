import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile } from 'src/entities/profile.entity';
import { CreateProfileDto } from './dto/createProfile.dto';
import { User } from 'src/entities/user.entity';
import { Role } from 'src/enum/role.enum';
import { FilterProfileDto } from './dto/filterProfile.dto';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/updateProfile.dto';

@Injectable()
export class ProfileService {
    constructor(@InjectRepository(Profile) private readonly profileRepository: Repository<Profile>) {}

    async createProfile(createProfileDto: CreateProfileDto, userId: number | undefined) {
        if (userId) {
            const existingProfile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
            if (existingProfile) {
                throw new ConflictException('Profile already exists for this user');
            }
        }
        const existingEmail = await this.profileRepository.findOne({ where: { email: createProfileDto.email } });
        if (existingEmail) {
            throw new ConflictException('Email is already in use');
        }
        const existingPhone = await this.profileRepository.findOne({ where: { phone: createProfileDto.phone } });
        if (existingPhone) {
            throw new ConflictException('Phone number is already in use');
        }
        const profile = this.profileRepository.create({
            ...createProfileDto,
            user: (userId ? { id: userId } : null) as User,
        });
        return this.profileRepository.save(profile);
    }

    async findProfiles(filters: FilterProfileDto, userId: number | undefined) {
        const queryBuilder = this.profileRepository.createQueryBuilder('profile').leftJoin('profile.user', 'user');

        if (userId) {
            queryBuilder.andWhere('user.id = :userId', { userId });
        }
        if (filters.email) {
            queryBuilder.andWhere('lower(profile.email) = lower(:email)', { email: filters.email });
        }
        if (filters.phone) {
            queryBuilder.andWhere('lower(profile.phone) = lower(:phone)', { phone: filters.phone });
        }
        if (filters.firstName) {
            queryBuilder.andWhere('lower(profile.firstName) = lower(:firstName)', { firstName: filters.firstName });
        }
        if (filters.lastName) {
            queryBuilder.andWhere('lower(profile.lastName) = lower(:lastName)', { lastName: filters.lastName });
        }
        if (filters.profileId) {
            queryBuilder.andWhere('profile.id = :profileId', { profileId: filters.profileId });
        }

        const profiles = await queryBuilder.getMany();
        return profiles;
    }

    async updateProfile(updateProfileDto: UpdateProfileDto, profileId: number, userRole: Role, userId: number) {
        const profile = await this.profileRepository.findOne({
            where: { id: profileId },
            relations: ['user'],
        });

        if (!profile) {
            throw new NotFoundException('Profile not found');
        }

        if (userRole !== Role.ADMIN && profile.user?.id !== userId) {
            throw new UnauthorizedException('You do not have permission to update this profile');
        }

        if (updateProfileDto.email && updateProfileDto.email !== profile.email) {
            const existingEmail = await this.profileRepository.findOne({ where: { email: updateProfileDto.email } });
            if (existingEmail) {
                throw new ConflictException('Email is already in use');
            }
        }

        if (updateProfileDto.phone && updateProfileDto.phone !== profile.phone) {
            const existingPhone = await this.profileRepository.findOne({ where: { phone: updateProfileDto.phone } });
            if (existingPhone) {
                throw new ConflictException('Phone number is already in use');
            }
        }

        Object.assign(profile, updateProfileDto);
        return this.profileRepository.save(profile);
    }

    async deleteProfile(profileId: number, userRole: Role, userId: number) {
        const profile = await this.profileRepository.findOne({
            where: { id: profileId },
            relations: ['user'],
        });

        if (!profile) {
            throw new NotFoundException('Profile not found');
        }

        if (userRole !== Role.ADMIN && profile.user?.id !== userId) {
            throw new UnauthorizedException('You do not have permission to delete this profile');
        }
        await this.profileRepository.delete(profileId);
    }
}

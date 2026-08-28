import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Profile } from 'src/entities/profile.entity';
import { CreateProfileDto } from './dto/createProfile.dto';
import { User } from 'src/entities/user.entity';
import { Role } from 'src/enum/role.enum';
import { FilterProfileDto } from './dto/filterProfile.dto';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/updateProfile.dto';
import { applyDefined } from 'src/common/apply-defined';

@Injectable()
export class ProfileService {
    constructor(@InjectRepository(Profile) private readonly profileRepository: Repository<Profile>) {}

    async createProfile(createProfileDto: CreateProfileDto, userRole: Role, userId?: number) {
        if (userRole !== Role.ADMIN) {
            createProfileDto.userId = userId;
        }
        if (createProfileDto.userId) {
            const existingProfile = await this.profileRepository.findOne({ where: { user: { id: createProfileDto.userId } } });
            if (existingProfile) {
                throw new ConflictException('Profile already exists for this user');
            }
        }
        // The guards matter: `findOne({ where: { email: undefined } })` drops the undefined
        // condition and degenerates into "find any profile", so a profile with no contact details
        // used to collide with the first row in the table. Contact fields are nullable by design —
        // an admin creates a profile with just a name and links an account later.
        if (createProfileDto.email) {
            const existingEmail = await this.profileRepository.findOne({ where: { email: createProfileDto.email } });
            if (existingEmail) {
                throw new ConflictException('Email is already in use');
            }
        }
        if (createProfileDto.phone) {
            const existingPhone = await this.profileRepository.findOne({ where: { phone: createProfileDto.phone } });
            if (existingPhone) {
                throw new ConflictException('Phone number is already in use');
            }
        }
        const profile = this.profileRepository.create({
            ...createProfileDto,
            user: (createProfileDto.userId ? { id: createProfileDto.userId } : null) as User,
        });
        return this.profileRepository.save(profile);
    }

    async findProfiles(filters: FilterProfileDto, userRole: Role, userId: number) {
        if (userRole !== Role.ADMIN) {
            filters.userId = userId;
        }
        const queryBuilder = this.profileRepository
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .leftJoinAndSelect('profile.children', 'child')
            .leftJoinAndSelect('child.group', 'group')
            // Same reason as in `ChildService.findChildren`: the contract's `Group` has a room.
            .leftJoinAndSelect('group.room', 'room')
            .leftJoinAndSelect('room.location', 'location');

        if (filters.userId) {
            queryBuilder.andWhere('user.id = :userId', { userId: filters.userId });
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
        const profilesReturnObject = profiles
            .map((profile) => ({
                ...profile,
                hasUser: profile.user !== null,
            }))
            .map((profile) => {
                profile.user = undefined;
                return profile;
            });
        return profilesReturnObject;
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

        applyDefined(profile, updateProfileDto);
        const updatedProfile = await this.profileRepository.save(profile);
        updatedProfile.user = undefined;
        return updatedProfile;
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

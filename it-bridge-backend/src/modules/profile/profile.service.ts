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

    async updateProfile(userId: number, updateProfileDto: CreateProfileDto) {
        const profile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        if (!profile) {
            throw new NotFoundException('Profile not found for the user');
        }
        Object.assign(profile, updateProfileDto);
        await this.profileRepository.save(profile);
        return {
            message: 'Profile updated successfully',
            profile,
        };
    }
}

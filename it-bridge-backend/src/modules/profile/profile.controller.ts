import { Controller, Post, UseGuards, Request, Get, Put, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/createProfile.dto';
import { AuthGuard } from 'src/guards/auth.guard';

// TODO: implement ADMIN controller (/profiles) for managing all profiles

@Controller('profile')
export class ProfileController {
    constructor(private readonly profileService: ProfileService) {}

    @Post('')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Profile created successfully' })
    @ApiResponse({ status: 401, description: 'User ID is required to create profile' })
    @ApiResponse({ status: 409, description: 'Profile for this user already exists' })
    createProfile(@Request() req, @Body() createProfileDto: CreateProfileDto) {
        return this.profileService.createProfile(req.user.sub, createProfileDto);
    }

    @Get('')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Profile not found for the user' })
    async getProfile(@Request() req) {
        return this.profileService.getProfileByUserId(req.user.sub);
    }

    @Put('')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 404, description: 'Profile not found for the user' })
    async updateProfile(@Request() req, @Body() updateProfileDto: CreateProfileDto) {
        return this.profileService.updateProfile(req.user.sub, updateProfileDto);
    }
}

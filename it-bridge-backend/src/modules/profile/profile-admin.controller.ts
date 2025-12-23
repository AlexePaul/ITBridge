import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateProfileDto } from './dto/createProfile.dto';
import { FilterProfileDto } from './dto/filterProfile.dto';

@Controller('profiles')
export class ProfileAdminController {
    constructor(private readonly profileService: ProfileService) {}

    @Post('')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Profile created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async createProfile(@Body() createProfileDto: CreateProfileDto) {
        return this.profileService.createProfileAdmin(createProfileDto);
    }

    @Get('')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profiles retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async findProfile(@Query() filters: FilterProfileDto) {
        return this.profileService.findProfile(filters);
    }

    @Put('/:profileId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async updateProfile(@Param('profileId') profileId: number, @Body() updateProfileDto: CreateProfileDto) {
        return this.profileService.updateProfile(profileId, updateProfileDto, 'admin');
    }
}

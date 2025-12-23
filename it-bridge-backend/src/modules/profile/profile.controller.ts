import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
    Request,
    Delete,
    HttpCode,
    ParseIntPipe,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { UserIdResolutionGuard } from 'src/guards/userIdResolution.guard';
import { ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CreateProfileDto } from './dto/createProfile.dto';
import { FilterProfileDto } from './dto/filterProfile.dto';
import { UpdateProfileDto } from './dto/updateProfile.dto';

@Controller('profiles')
export class ProfileController {
    constructor(private readonly profileService: ProfileService) {}

    @Post('')
    @UseGuards(AuthGuard, UserIdResolutionGuard)
    @ApiBearerAuth()
    @ApiQuery({ name: 'userId', required: false, type: Number, description: 'User ID (Admin only)' })
    @ApiResponse({ status: 201, description: 'Profile created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async createProfile(@Request() req, @Body() createProfileDto: CreateProfileDto) {
        return this.profileService.createProfile(createProfileDto, req.resolvedUserId);
    }

    @Get('')
    @UseGuards(AuthGuard, UserIdResolutionGuard)
    @ApiBearerAuth()
    @ApiQuery({ name: 'userId', required: false, type: Number, description: 'User ID (Admin only)' })
    @ApiResponse({ status: 200, description: 'Profiles retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async findProfiles(@Request() req, @Query() filters: FilterProfileDto) {
        return this.profileService.findProfiles(filters, req.resolvedUserId);
    }

    @Put('/:profileId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async updateProfile(
        @Request() req,
        @Body() updateProfileDto: UpdateProfileDto,
        @Param('profileId', ParseIntPipe) profileId: number,
    ) {
        return this.profileService.updateProfile(updateProfileDto, profileId, req.user.role, req.user.sub);
    }

    @Delete('/:profileId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Profile deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async deleteProfile(@Request() req, @Param('profileId', ParseIntPipe) profileId: number) {
        return this.profileService.deleteProfile(profileId, req.user.role, req.user.sub);
    }
}

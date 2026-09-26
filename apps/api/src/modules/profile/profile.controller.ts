import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, Request, Delete, HttpCode, ParseIntPipe } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateProfileDto } from './dto/createProfile.dto';
import { FilterProfileDto } from './dto/filterProfile.dto';
import { UpdateProfileDto } from './dto/updateProfile.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { actorFrom } from 'src/modules/audit/actor';
import { AccountClaimService } from 'src/modules/auth/account-claim.service';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';

@Controller('profiles')
export class ProfileController {
    constructor(
        private readonly profileService: ProfileService,
        private readonly accountClaims: AccountClaimService,
    ) {}

    @Post('')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Profile created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async createProfile(@Request() req: AuthenticatedRequest, @Body() createProfileDto: CreateProfileDto) {
        return this.profileService.createProfile(createProfileDto, req.user.role, req.user.sub, actorFrom(req));
    }

    @Get('')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profiles retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async findProfiles(@Request() req: AuthenticatedRequest, @Query() filters: FilterProfileDto) {
        return this.profileService.findProfiles(filters, req.user.role, req.user.sub);
    }

    @Put('/:profileId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async updateProfile(@Request() req: AuthenticatedRequest, @Body() updateProfileDto: UpdateProfileDto, @Param('profileId', ParseIntPipe) profileId: number) {
        return this.profileService.updateProfile(updateProfileDto, profileId, req.user.role, req.user.sub, actorFrom(req));
    }

    @Delete('/:profileId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Profile deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async deleteProfile(@Request() req: AuthenticatedRequest, @Param('profileId', ParseIntPipe) profileId: number) {
        return this.profileService.deleteProfile(profileId, req.user.role, req.user.sub, actorFrom(req));
    }

    /**
     * "Trimite linkul de cont" on the family page — E11 S2, review of 26 September 2026.
     *
     * A family the office typed in has no account and, until this, no way to get one: `register`
     * refused the address and no screen could attach an account afterwards. The link goes to the
     * address on the profile and lets the family create its own account there; it is refused with
     * its own code when the family already has one, has no address, or was erased. Audited.
     */
    @Post('/:profileId/account-claim')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'A claim link was queued to the address on the profile' })
    @ApiResponse({ status: 409, description: 'The profile has an account, has no address, or was erased' })
    async sendAccountClaim(@Request() req: AuthenticatedRequest, @Param('profileId', ParseIntPipe) profileId: number) {
        return this.accountClaims.sendForProfile(profileId, actorFrom(req));
    }
}

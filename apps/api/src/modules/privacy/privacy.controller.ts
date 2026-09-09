import { Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { Profile } from 'src/entities/profile.entity';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { ExportService } from './export.service';

/**
 * The rights a family exercises over its own data — E07 S4.
 *
 * Separate from `ProfileController` on purpose: those endpoints are the school running its
 * business, these are a family exercising a right the law gives it. They have different audiences,
 * different reasons to exist, and — when the erasure half lands — very different consequences.
 */
@Controller('privacy')
export class PrivacyController {
    constructor(
        private readonly exportService: ExportService,
        @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    ) {}

    /**
     * A family's own data, in one document.
     *
     * **No `:id` in the path.** The profile comes from the token, so there is no parameter for a
     * parent to change to somebody else's — the strongest form of the rule the rest of the codebase
     * enforces in the service, applied where the payload is *everything* the school holds.
     */
    @Get('/export')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Tot ce ține școala despre familia care cere',
        description: 'GDPR art. 15 și 20. Profilul vine din token, nu din cale: nu există parametru de schimbat.',
    })
    @ApiResponse({ status: 200, description: "The requesting family's whole record" })
    @ApiResponse({ status: 404, description: 'The account has no profile attached yet' })
    async exportOwn(@Request() req: AuthenticatedRequest) {
        const profile = await this.profiles.findOne({ where: { user: { id: req.user.sub } } });
        if (!profile) throw new NotFoundException('Profile not found');

        return this.exportService.forProfile(profile.id);
    }

    /**
     * The same document, for a family that asked the office rather than the portal.
     *
     * ADMIN only, and a separate handler rather than an optional parameter on the one above: an
     * endpoint whose audience depends on a query string is one refactor away from serving the wrong
     * one. A family with no account — a trial booked from the public form — can only be served this
     * way, and that is the case this exists for.
     */
    @Get('/export/:profileId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Exportul unei familii, cerut la birou' })
    @ApiResponse({ status: 200, description: "One family's whole record" })
    async exportFor(@Param('profileId', ParseIntPipe) profileId: number, @Request() req: AuthenticatedRequest) {
        // Belt and braces: the guard already refuses a parent, and this refuses one that got past it.
        if (req.user.role !== Role.ADMIN) throw new ForbiddenException();

        return this.exportService.forProfile(profileId);
    }
}

import { Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
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
import { ErasureService } from './erasure.service';
import { actorFrom } from 'src/modules/audit/actor';

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
        private readonly erasureService: ErasureService,
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
        const profile = await this.ownProfile(req.user.sub);

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

    /**
     * The family asks for the account to be erased.
     *
     * Nothing is deleted here. GDPR gives a month, and the office has to look first — at whether the
     * request really comes from the family, and at what the accounting obligation keeps. A button
     * that emptied the account on the spot would also be a button somebody presses by accident, and
     * there is nothing on the other side of it.
     */
    @Post('/erasure')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Cere ștergerea contului',
        description: 'Consemnează cererea și pornește termenul. Ștergerea propriu-zisă o face biroul, în cel mult 30 de zile.',
    })
    @ApiResponse({ status: 201, description: 'The request is on file' })
    @ApiResponse({ status: 409, description: 'ALREADY_ERASED' })
    async requestErasure(@Request() req: AuthenticatedRequest) {
        const profile = await this.ownProfile(req.user.sub);
        return this.erasureService.request(profile.id, actorFrom(req));
    }

    /** The family changes its mind. Nothing had been deleted, so nothing comes back. */
    @Delete('/erasure')
    @UseGuards(AuthGuard)
    @HttpCode(204)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Retrage cererea de ștergere' })
    @ApiResponse({ status: 204, description: 'The request is withdrawn' })
    async withdrawErasure(@Request() req: AuthenticatedRequest) {
        const profile = await this.ownProfile(req.user.sub);
        await this.erasureService.withdrawRequest(profile.id, actorFrom(req));
    }

    /** The office's queue, oldest request first — the thirty-day clock, in order. */
    @Get('/erasure/pending')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Familiile care au cerut ștergerea, cea mai veche cerere prima' })
    @ApiResponse({ status: 200, description: 'Families waiting' })
    async pendingErasures() {
        return this.erasureService.pending();
    }

    /**
     * Carries the erasure out. ADMIN only, and deliberately not something the family can trigger.
     *
     * Declared after `/erasure/pending`, because Nest matches in declaration order and
     * `ParseIntPipe` answers 400 for the word — the same trap `ProjectController` and
     * `LeadController` document.
     */
    @Post('/erasure/:profileId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Șterge datele familiei, păstrând facturile',
        description:
            'Copiii, înscrierile, prezențele, proiectele, lead-urile, reducerile, mesajele și contul dispar. Rândul familiei rămâne golit, fiindcă facturile atârnă de el și evidența contabilă se păstrează.',
    })
    @ApiResponse({ status: 201, description: 'What was removed and what was kept' })
    @ApiResponse({ status: 409, description: 'ALREADY_ERASED' })
    async erase(@Param('profileId', ParseIntPipe) profileId: number, @Request() req: AuthenticatedRequest) {
        return this.erasureService.erase(profileId, actorFrom(req));
    }

    /** The caller's own profile, or a 404 — the one lookup three handlers above share. */
    private async ownProfile(userId: number) {
        const profile = await this.profiles.findOne({ where: { user: { id: userId } } });
        if (!profile) throw new NotFoundException('Profile not found');
        return profile;
    }
}

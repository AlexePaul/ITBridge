import { Controller, Delete, Get, NotFoundException, Param, ParseEnumPipe, ParseIntPipe, Put, Query, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { PublicationPurpose } from 'src/enum/publication-purpose.enum';
import { Profile } from 'src/entities/profile.entity';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { actorFrom } from 'src/modules/audit/actor';
import { PublicationConsentService } from './publication-consent.service';

/**
 * A family's consent to use a child's work — E07 S2.
 *
 * Next to `PrivacyController` and in its module, because it is the same kind of thing: a right a
 * family exercises over its own data, here the one GDPR art. 7 alin. 3 describes — withdrawing must
 * be as easy as giving. A controller of its own because the audience is split the other way round:
 * the family reads and writes here as much as the office does.
 */
@Controller('privacy/consents')
export class ConsentController {
    constructor(
        private readonly consents: PublicationConsentService,
        @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    ) {}

    /** The caller's own children. No id in the path: the family comes from the token. */
    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Acordurile familiei care cere, copil cu copil' })
    @ApiResponse({ status: 200, description: 'Every child of the requesting family, every purpose, with the history' })
    @ApiResponse({ status: 404, description: 'The account has no profile attached yet' })
    async ownConsents(@Request() req: AuthenticatedRequest) {
        const profile = await this.profiles.findOne({ where: { user: { id: req.user.sub } } });
        if (!profile) throw new NotFoundException('Profile not found');

        return this.consents.forProfile(profile.id);
    }

    /**
     * The children whose work may be used today. What the office reads before a work goes on the
     * site or on a social page — the site does not read from the platform, so this is the check.
     */
    @Get('in-force')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiQuery({ name: 'purpose', required: false, enum: PublicationPurpose })
    @ApiOperation({ summary: 'Copiii ale căror lucrări se pot folosi azi' })
    @ApiResponse({ status: 200, description: 'One row per consent in force, by the child’s name' })
    async inForce(@Query('purpose', new ParseEnumPipe(PublicationPurpose, { optional: true })) purpose?: PublicationPurpose) {
        return this.consents.inForce(purpose ?? PublicationPurpose.PROMOTION);
    }

    /** One family, for its page on the admin side. */
    @Get('profile/:profileId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Acordurile unei familii, copil cu copil' })
    @ApiResponse({ status: 200, description: 'Every child of the family, every purpose, with the history' })
    async familyConsents(@Param('profileId', ParseIntPipe) profileId: number) {
        return this.consents.forProfile(profileId);
    }

    /**
     * Records a consent. A parent for their own child, from the portal; the office for any child,
     * from a signed paper form. Idempotent: a second grant while one is in force changes nothing.
     */
    @Put(':childId/:purpose')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Consemnează acordul pentru lucrările unui copil',
        description: 'Părintele pentru copilul lui, din portal; biroul pentru oricare, după formularul semnat. Familia primește confirmarea pe email.',
    })
    @ApiResponse({ status: 200, description: 'The child, every purpose, as it now stands' })
    @ApiResponse({ status: 403, description: 'Not the requesting family’s child' })
    async grant(
        @Param('childId', ParseIntPipe) childId: number,
        @Param('purpose', new ParseEnumPipe(PublicationPurpose)) purpose: PublicationPurpose,
        @Request() req: AuthenticatedRequest,
    ) {
        return this.consents.grant(childId, purpose, { userId: req.user.sub, role: req.user.role }, actorFrom(req));
    }

    /**
     * Withdraws it — as easily as it was given, which is what GDPR art. 7 alin. 3 asks. The office
     * is told in the same transaction, because what was already published has to be taken down by
     * a person.
     */
    @Delete(':childId/:purpose')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Retrage acordul pentru lucrările unui copil',
        description: 'Din clipa asta lucrările nu mai intră în niciun material nou; biroul e anunțat să scoată ce era publicat.',
    })
    @ApiResponse({ status: 200, description: 'The child, every purpose, as it now stands' })
    @ApiResponse({ status: 403, description: 'Not the requesting family’s child' })
    async revoke(
        @Param('childId', ParseIntPipe) childId: number,
        @Param('purpose', new ParseEnumPipe(PublicationPurpose)) purpose: PublicationPurpose,
        @Request() req: AuthenticatedRequest,
    ) {
        return this.consents.revoke(childId, purpose, { userId: req.user.sub, role: req.user.role }, actorFrom(req));
    }
}

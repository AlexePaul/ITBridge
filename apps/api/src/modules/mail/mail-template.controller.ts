import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { MailTemplateService } from './mail-template.service';
import { PreviewMailTemplateDto, UpdateMailTemplateDto } from './dto/mailTemplate.dto';

/**
 * The template editor's API — E17/S2. Admin only, all of it: the wording of the school's mail is
 * the school's to change, and nobody else's to read.
 */
@Controller('mail-templates')
export class MailTemplateController {
    constructor(private readonly mailTemplateService: MailTemplateService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Toate șabloanele: implicite din cod, personalizările din bază' })
    async list() {
        return this.mailTemplateService.list();
    }

    @Get(':key')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 404, description: 'The key is not one of the templates the code sends' })
    async get(@Param('key') key: string) {
        return this.mailTemplateService.get(key);
    }

    @Post(':key/preview')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Randează șablonul cu datele de test',
        description: 'Primește câmpurile nesalvate din editor, ca un placeholder greșit să se vadă înainte de salvare, nu după.',
    })
    async preview(@Param('key') key: string, @Body() dto: PreviewMailTemplateDto) {
        return this.mailTemplateService.preview(key, dto);
    }

    @Put(':key')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Salvează formularea școlii — fără deploy' })
    async save(@Param('key') key: string, @Body() dto: UpdateMailTemplateDto) {
        return this.mailTemplateService.save(key, { subject: dto.subject, bodyText: dto.bodyText, bodyHtml: dto.bodyHtml ?? null });
    }

    @Delete(':key')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Revine la formularea din cod' })
    async revert(@Param('key') key: string) {
        return this.mailTemplateService.revert(key);
    }
}

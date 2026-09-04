import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AnnouncementService } from './announcement.service';
import { SendAnnouncementDto } from './dto/sendAnnouncement.dto';

/**
 * Announcements — E17/S7. Admin only, every one of them.
 *
 * There is no parent-facing half and there is not going to be one: an announcement is something the
 * school says to a room full of families, and the copy each family gets is an ordinary message in
 * their inbox. Reading the record means reading who else was written to, which is a family list.
 */
@Controller('announcements')
export class AnnouncementController {
    constructor(private readonly announcementService: AnnouncementService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Anunțurile trimise, cu cât a ajuns din fiecare' })
    async list() {
        return this.announcementService.list();
    }

    /**
     * Declared before `:id`, like `ProjectController`'s literal routes: Nest matches in declaration
     * order and `:id` carries a `ParseIntPipe`, which answers 400 to the word "preview".
     */
    @Post('preview')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Ce ar pleca, către câți, și ce pare în neregulă',
        description: 'Randează mesajul exact cum va fi trimis și raportează prenumele de copii găsite în text.',
    })
    async preview(@Body() dto: SendAnnouncementDto) {
        return this.announcementService.preview(dto);
    }

    @Post('test')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'O copie de probă către adresa ta', description: 'Cere-o înainte de orice difuzare în masă. Răspunsul spune unde a plecat.' })
    async sendTest(@Body() dto: SendAnnouncementDto, @Request() req: AuthenticatedRequest) {
        return this.announcementService.sendTest(dto, req.user.sub);
    }

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Trimite anunțul',
        description: 'Un mesaj per părinte. Refuză un text care numește un copil, până la confirmare, și un anunț identic trimis deja azi.',
    })
    @ApiResponse({ status: 409, description: 'ANNOUNCEMENT_NAMES_A_CHILD, ANNOUNCEMENT_ALREADY_SENT sau ANNOUNCEMENT_NO_RECIPIENTS' })
    async send(@Body() dto: SendAnnouncementDto, @Request() req: AuthenticatedRequest) {
        return this.announcementService.send(dto, req.user.sub);
    }

    @Get(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Un anunț și fiecare mesaj pe care l-a produs' })
    async findOne(@Param('id', ParseIntPipe) id: number) {
        return this.announcementService.findOne(id);
    }
}

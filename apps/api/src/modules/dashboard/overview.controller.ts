import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { OverviewService } from './overview.service';

/** The overview — E21/S1. Admin only: it is the whole school on one screen, money included. */
@Controller('overview')
export class OverviewController {
    constructor(private readonly overviewService: OverviewService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Cum stăm, într-o privire',
        description:
            'Fiecare număr e cerut de la cine deține deja întrebarea — nemarcatele de la orar, restanțele de la facturi, ocuparea de la înscrieri. Nicio definiție nouă.',
    })
    @ApiResponse({ status: 200, description: "Today's classes, the backlog, the money and the queues that go stale" })
    async overview() {
        return this.overviewService.build();
    }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { DeliveryLogService } from './delivery-log.service';
import { DeliveryLogFilterDto } from './dto/deliveryLogFilter.dto';

/**
 * The delivery record — E17/S5. Admin only: every row carries a family's address and the text of
 * what was written to them.
 */
@Controller('deliveries')
export class DeliveryLogController {
    constructor(private readonly deliveryLogService: DeliveryLogService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Ce a plecat, ce n-a plecat și de ce',
        description: 'Răspunde la „a primit părintele anunțul?" — inclusiv pentru mesajele care n-au avut unde să plece.',
    })
    @ApiResponse({ status: 200, description: 'Messages, newest first' })
    async list(@Query() filter: DeliveryLogFilterDto) {
        return this.deliveryLogService.list(filter);
    }

    @Get('summary')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Câte mesaje sunt în fiecare stare' })
    async summary() {
        return this.deliveryLogService.summary();
    }
}

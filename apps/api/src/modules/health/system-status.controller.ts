import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { SystemStatus, SystemStatusService } from './system-status.service';

/**
 * `/admin/sistem`'s one question. Beside `/health` and `/ready` because it is the same kind of
 * question — can this backend do its job — asked by a person instead of a probe, so it answers why.
 * That is also why it is ADMIN only, where the probes are public: the answer names the bucket, the
 * sending address and the schema's version.
 */
@Controller('system')
export class SystemStatusController {
    constructor(private readonly systemStatus: SystemStatusService) {}

    @Get('status')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'How this backend is configured, and what looks wrong',
        description: 'Keys are reported as set or not, never shown. `notes` are codes; the screen has a sentence for each.',
    })
    @ApiResponse({ status: 200, description: 'The configuration, read now' })
    status(): Promise<SystemStatus> {
        return this.systemStatus.read();
    }
}

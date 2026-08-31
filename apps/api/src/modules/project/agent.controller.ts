import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AgentService } from './agent.service';
import { AgentHeartbeatDto } from './dto/agentHeartbeat.dto';
import { ReportUnassignedFileDto } from './dto/reportUnassignedFile.dto';
import { FilterUnassignedDto } from './dto/filterUnassigned.dto';

/**
 * Everything the upload agent talks to. E14/S2.
 *
 * A controller of its own rather than more routes on `/projects`, because the audience is different:
 * these are read and written by a Windows service in the office, not by a screen. The one endpoint a
 * screen also uses is `GET /agent/status`, which is how an admin learns that the office computer has
 * been off since lunchtime instead of concluding that nobody made anything today.
 *
 * All `ADMIN`, because no other role exists — see `AgentService` for why that is accepted and what
 * would change it.
 */
@Controller('agent')
export class AgentController {
    constructor(private readonly agentService: AgentService) {}

    @Get('mirror')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'The folder tree to mirror onto the network share',
        description:
            'Locations, their active groups, and the children in each. The child id travels with the name because the folder is named after both: two children with the same first name in one group is ordinary, and a folder renamed by hand must not orphan the files in it.',
    })
    @ApiResponse({ status: 200, description: 'Tree retrieved' })
    async mirror() {
        return this.agentService.mirror();
    }

    @Post('heartbeat')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'The agent reporting that it is alive',
        description: 'Upserted on the agent name. Silence is what an admin screen turns into "the agent has not reported for 3 hours".',
    })
    @ApiResponse({ status: 201, description: 'Recorded' })
    async heartbeat(@Body() dto: AgentHeartbeatDto) {
        return this.agentService.heartbeat(dto);
    }

    @Get('status')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'When each agent last reported' })
    @ApiResponse({ status: 200, description: 'Statuses retrieved' })
    async statuses() {
        return this.agentService.statuses();
    }

    @Post('unassigned')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'A file the agent could not place',
        description:
            'Idempotent on the path, so a rescan after a restart does not file the same stray twice. The file itself stays on the share, in `_neatribuite`.',
    })
    @ApiResponse({ status: 201, description: 'Recorded, or already recorded' })
    async reportUnassigned(@Body() dto: ReportUnassignedFileDto) {
        return this.agentService.reportUnassigned(dto);
    }

    @Get('unassigned')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Files waiting for somebody to decide whose they are' })
    @ApiResponse({ status: 200, description: 'Files retrieved' })
    async findUnassigned(@Query() filters: FilterUnassignedDto) {
        return this.agentService.findUnassigned(filters.groupId, filters.includeResolved ?? false);
    }

    @Put('unassigned/:id/resolve')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Mark a stray file as dealt with', description: 'The row stays as a record; the file on the share is untouched.' })
    @ApiResponse({ status: 200, description: 'Resolved' })
    @ApiResponse({ status: 404, description: 'No such report' })
    async resolveUnassigned(@Param('id', ParseIntPipe) id: number) {
        return this.agentService.resolveUnassigned(id);
    }
}

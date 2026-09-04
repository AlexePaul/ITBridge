import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { CreateLeadDto } from './dto/createLead.dto';
import { FilterLeadsDto } from './dto/filterLeads.dto';
import { LoseLeadDto } from './dto/loseLead.dto';
import { UpdateLeadDto } from './dto/updateLead.dto';
import { LeadService } from './lead.service';

/**
 * The office's side of the funnel — E20/S1 and S3. Admin only: a lead is a family's contact details
 * and a child's age, which is nobody's business but the school's.
 *
 * **Route order matters here.** `follow-up` and `undecided` are declared before `:id`, because Nest
 * matches in declaration order and `:id` carries a `ParseIntPipe` that answers 400 to a word. It is
 * the same trap `ProjectController` documents; this is the second controller in the repo with
 * literal routes sharing a prefix with a numeric parameter.
 *
 * There is no `DELETE`. A lead that turns out to be a wrong number is closed as lost with that as
 * the reason — S4 counts what came in, and a row deleted is a request that never happened.
 */
@Controller('leads')
export class LeadController {
    constructor(private readonly leads: LeadService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Open requests, the longest untouched first' })
    @ApiResponse({ status: 200, description: 'Leads, settled ones left out unless asked for' })
    async list(@Query() filters: FilterLeadsDto) {
        return this.leads.list(filters);
    }

    @Get('follow-up')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Everything that needs somebody today',
        description:
            'The four lists the daily reminder is made of: trials held without a decision, families nobody had a seat for, leads untouched for a week, and follow-ups whose date has come.',
    })
    @ApiResponse({ status: 200, description: 'The same figures the office email carries' })
    async followUp() {
        return this.leads.followUp();
    }

    @Get('undecided')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Trials held, no decision — the screen this story is built around',
        description:
            'A family on this list has already been given a seat, a teacher and an hour of class. It leaves it in one of two ways, both written down: enrolled in E11, or lost with a reason.',
    })
    @ApiResponse({ status: 200, description: 'Oldest first, with how many days each has been waiting' })
    async undecided() {
        return this.leads.undecidedTrials();
    }

    @Get(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'One request, with everything it turned into' })
    @ApiResponse({ status: 200, description: 'Lead found' })
    @ApiResponse({ status: 404, description: 'No such lead' })
    async findOne(@Param('id', ParseIntPipe) id: number) {
        return this.leads.findOne(id);
    }

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Write down a request that arrived some other way',
        description: 'A phone call, somebody at the door. The admin who writes it owns it.',
    })
    @ApiResponse({ status: 201, description: 'Lead created' })
    async create(@Body() dto: CreateLeadDto, @Request() req: AuthenticatedRequest) {
        return this.leads.create(dto, req.user.sub);
    }

    @Patch(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Notes, contact details, the owner, the next step',
        description: 'Deliberately not the status: four of the six are consequences, and the other two have their own endpoints.',
    })
    @ApiResponse({ status: 200, description: 'Lead updated' })
    async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeadDto) {
        return this.leads.update(id, dto);
    }

    @Post(':id/contacted')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Somebody spoke to this family' })
    @ApiResponse({ status: 201, description: 'Marked as contacted' })
    @ApiResponse({ status: 409, description: 'Already past that point; the later statuses come from what happened, not from this button' })
    async markContacted(@Param('id', ParseIntPipe) id: number) {
        return this.leads.markContacted(id);
    }

    @Post(':id/lost')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Close a request, with the reason written down',
        description: 'The only way out of the follow-up lists other than an enrolment. Time passing is not a way out.',
    })
    @ApiResponse({ status: 201, description: 'Closed' })
    @ApiResponse({ status: 409, description: 'The family is already enrolled; that is closed in E11, not here' })
    async markLost(@Param('id', ParseIntPipe) id: number, @Body() dto: LoseLeadDto) {
        return this.leads.markLost(id, dto);
    }
}

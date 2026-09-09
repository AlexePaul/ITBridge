import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/queryAudit.dto';

/**
 * Reading the trail — E07 S3.
 *
 * One verb, and only one: `GET`. There is no endpoint here that writes, edits or removes an entry,
 * because the value of the table is exactly that nothing can. Writing is a side effect of the act
 * being recorded, in the same transaction, through `AuditService.record`.
 */
@Controller('audit')
export class AuditController {
    constructor(private readonly auditService: AuditService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Who changed what, newest first',
        description:
            "The story's question — \"who changed invoice 412's amount and when\" — is `?entityType=Invoice&entityId=412`. ADMIN only: the log is a record of what the school's staff did.",
    })
    @ApiResponse({ status: 200, description: 'Matching entries, newest first' })
    async find(@Query() query: QueryAuditDto) {
        return this.auditService.find(query);
    }
}

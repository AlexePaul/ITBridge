import { Body, Controller, Get, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe, HttpCode, Response, StreamableFile } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';
import { GetPreviewDto } from './dto/getPreview.dto';
import { IssueFromSessionsDto } from './dto/issueFromSessions.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('invoices')
export class InvoiceController {
    constructor(private readonly invoiceService: InvoiceService) {}

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Invoice created' })
    async createInvoice(@Body() dto: CreateInvoiceDto) {
        return this.invoiceService.createInvoice(dto);
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findInvoices(@Query() filter: FilterInvoiceDto, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.findInvoices(filter, req.user.role, req.user.sub);
    }

    /**
     * Declared above `/:id` deliberately. Nest matches in declaration order, so placed after the
     * parameter route this would never be reached — `ParseIntPipe` would be handed the string
     * `'worksheet'` and answer 400, which is exactly what it did.
     */
    @Get('/worksheet')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Fișa de emitere a lunii: fiecare familie, fiecare copil, fiecare grupă',
        description:
            'Fără sume — sumele se calculează pe ecran, pe măsură ce se completează orele. `alreadyInvoiced` marchează familiile care au deja factură pe luna asta, ca ecranul să poată fi rulat de mai multe ori.',
    })
    @ApiResponse({ status: 200, description: 'One row per family with children in a group' })
    async worksheet(@Query('monthIssued') monthIssued: string) {
        return this.invoiceService.getWorksheet(monthIssued);
    }

    @Get('/:id')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.findOne(id, req.user.role, req.user.sub);
    }

    @Put('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInvoiceDto) {
        return this.invoiceService.updateInvoice(id, dto);
    }

    @Delete('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Invoice deleted' })
    async remove(@Param('id', ParseIntPipe) id: number) {
        await this.invoiceService.deleteInvoice(id);
    }

    @Post('/issue')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Emite facturile lunii din orele completate',
        description:
            'Sumele sunt cele de pe ecran, nu recalculate din orar: cine apasă butonul s-a uitat la fiecare număr. Familiile deja facturate și cele cu total zero sunt sărite și raportate.',
    })
    @ApiResponse({ status: 201, description: 'Invoices issued, plus the families skipped and why' })
    async issueFromSessions(@Body() issueFromSessionsDto: IssueFromSessionsDto) {
        return this.invoiceService.issueFromSessions(issueFromSessionsDto);
    }

    @Post('/preview')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Invoice PDF preview retrieved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invoice not found' })
    async previewInvoicePdf(@Body() dto: GetPreviewDto) {
        return this.invoiceService.getPreview(dto);
    }

    @Get('/:id/pdf')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Invoice PDF retrieved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invoice not found' })
    async getInvoicePdf(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        const pdfBuffer = await this.invoiceService.getInvoicePdf(id, req.user.role, req.user.sub);

        return new StreamableFile(pdfBuffer, {
            type: 'application/pdf',
            disposition: 'attachment; filename="invoice.pdf"',
        });
    }
}

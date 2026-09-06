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
import { IssueMonthDto } from './dto/issueMonth.dto';
import { SessionCountOverrideDto } from './dto/sessionCountOverride.dto';
import { ArrearsService } from './arrears.service';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('invoices')
export class InvoiceController {
    constructor(
        private readonly invoiceService: InvoiceService,
        private readonly arrearsService: ArrearsService,
    ) {}

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
        summary: 'Fișa de emitere a lunii: fiecare familie, fiecare copil, numărul de ședințe citit din cataloage',
        description:
            'Luna de predare — săptămânile a căror luni cade în ea. Numărul per copil e numărat din cataloage (E15/S9), nu tastat, și vine cu desfacerea lui; deasupra stau ședințele lunii fără catalog. ' +
            '`alreadyInvoiced` marchează familiile care au deja factură pe luna asta, ca ecranul să poată fi rulat de mai multe ori.',
    })
    @ApiResponse({ status: 200, description: 'The month, its range, the unmarked sessions and one row per family enrolled in it' })
    async worksheet(@Query('monthIssued') monthIssued: string) {
        return this.invoiceService.getWorksheet(monthIssued);
    }

    /**
     * Who has not paid, oldest debt first — E16/S7.
     *
     * Declared above the parameter routes, like every other named path here: `:id` carries a
     * `ParseIntPipe` and would answer 400 for the word.
     */
    @Get('/arrears')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Restanțele, cu vechime',
        description: 'Derivat din plățile reușite, nu din coloana de stare — un ecran despre bani nu are voie să greșească o zi fiindcă n-a rulat un job.',
    })
    @ApiResponse({ status: 200, description: 'Unpaid invoices with ageing, longest overdue first' })
    async arrears() {
        return this.arrearsService.list();
    }

    /**
     * The one number that still enters by hand — E15/S9's override, per child and month. Both
     * routes sit above `/:id` for the usual reason.
     */
    @Put('/overrides')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Facturează alt număr de ședințe decât cel numărat, pentru un copil, pe o lună',
        description:
            'O decizie consemnată — cine, când, cât și de ce — nu un câmp pe cererea de emitere: `POST /invoices/issue` rămâne fără numere. ' +
            'Un rând per copil și lună; a doua decizie o înlocuiește pe prima; zero înseamnă „luna asta nu". Refuzat odată ce familia are factură pe lună.',
    })
    @ApiResponse({ status: 200, description: 'The decision on file' })
    @ApiResponse({ status: 404, description: 'No such child' })
    @ApiResponse({ status: 409, description: 'MONTH_ALREADY_INVOICED' })
    async setOverride(@Body() dto: SessionCountOverrideDto, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.setSessionCountOverride(dto, req.user.sub);
    }

    @Delete('/overrides/:monthIssued/:childId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Renunță la decizie: numărul revine la cel din cataloage' })
    @ApiResponse({ status: 200, description: 'Cleared' })
    @ApiResponse({ status: 409, description: 'MONTH_ALREADY_INVOICED' })
    async clearOverride(@Param('monthIssued') monthIssued: string, @Param('childId', ParseIntPipe) childId: number) {
        await this.invoiceService.clearSessionCountOverride(monthIssued, childId);
        return { cleared: true };
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
        summary: 'Emite facturile lunii din cataloage',
        description:
            'Primește luna și data de emitere, nimic altceva: sumele se numără din cataloagele lunii (E15/S9), cu aceeași interogare care a umplut fișa. Familiile deja facturate sunt sărite și raportate; cele cu total zero primesc un rând fără PDF.',
    })
    @ApiResponse({ status: 201, description: 'Invoices issued, plus the families skipped and why' })
    @ApiResponse({ status: 400, description: 'A request that still sends session counts' })
    async issueFromSessions(@Body() dto: IssueMonthDto) {
        return this.invoiceService.issueFromSessions(dto);
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

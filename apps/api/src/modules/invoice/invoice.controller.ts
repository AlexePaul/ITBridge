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
import { actorFrom } from 'src/modules/audit/actor';
import { FiscalIssuingService } from './fiscal-issuing.service';
import { FiscalDivergenceService } from './fiscal-divergence.service';
import { ConfirmFiscalNumberDto } from './dto/confirmFiscalNumber.dto';

@Controller('invoices')
export class InvoiceController {
    constructor(
        private readonly invoiceService: InvoiceService,
        private readonly arrearsService: ArrearsService,
        private readonly fiscal: FiscalIssuingService,
        private readonly divergence: FiscalDivergenceService,
    ) {}

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Invoice created' })
    async createInvoice(@Body() dto: CreateInvoiceDto, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.createInvoice(dto, actorFrom(req));
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findInvoices(@Query() filter: FilterInvoiceDto, @Request() req: AuthenticatedRequest) {
        // With what arrived against each and what is left: the portal's "de plătit" is that figure,
        // not the invoice's total.
        return this.arrearsService.withBalances(await this.invoiceService.findInvoices(filter, req.user.role, req.user.sub));
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
     * Where the fiscal queue stands — E16/S3's progress, one month or all of them.
     *
     * Above `/:id`, like every named path here. Carries the mode: "în coadă" means one thing when
     * the timer is sending and another when `SMARTBILL_MODE` is `off`.
     */
    @Get('/fiscal-queue')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Starea cozii fiscale: modul SmartBill și câte facturi sunt în fiecare stare',
        description: 'Numără facturile după `fiscalStatus`, pe luna cerută sau pe toate. `mode` spune dacă platforma trimite (`draft`, `live`) sau nu (`off`).',
    })
    @ApiResponse({ status: 200, description: 'Mode, missing settings, lock-out and counts per fiscal state' })
    async fiscalQueue(@Query('monthIssued') monthIssued?: string) {
        return this.fiscal.status(monthIssued || undefined);
    }

    /**
     * Where the platform and SmartBill disagree — E16/S8. SmartBill's side as last read (a day
     * apart at most), judged against the platform's side as it is now. Above `/:id`.
     */
    @Get('/fiscal-divergences')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Raportul de divergențe dintre platformă și SmartBill',
        description:
            'Facturile emise în SmartBill la care suma încasată, totalul sau existența documentului diferă între cele două sisteme, cu motivul fiecăreia. Partea SmartBill e cea citită ultima dată; nu se citește nimic în cerere.',
    })
    @ApiResponse({ status: 200, description: 'Counts, staleness and the divergent invoices with their reasons' })
    async fiscalDivergences() {
        return this.divergence.report();
    }

    /** "Verifică acum": every issued invoice is re-read over the next minutes, at the usual pace. */
    @Post('/fiscal-divergences/refresh')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'How many invoices were marked due for a read' })
    async refreshFiscalDivergences() {
        return this.divergence.markAllDue();
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
        return this.invoiceService.setSessionCountOverride(dto, req.user.sub, actorFrom(req));
    }

    @Delete('/overrides/:monthIssued/:childId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Renunță la decizie: numărul revine la cel din cataloage' })
    @ApiResponse({ status: 200, description: 'Cleared' })
    @ApiResponse({ status: 409, description: 'MONTH_ALREADY_INVOICED' })
    async clearOverride(@Param('monthIssued') monthIssued: string, @Param('childId', ParseIntPipe) childId: number, @Request() req: AuthenticatedRequest) {
        await this.invoiceService.clearSessionCountOverride(monthIssued, childId, actorFrom(req));
        return { cleared: true };
    }

    @Get('/:id')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        const [invoice] = await this.arrearsService.withBalances([await this.invoiceService.findOne(id, req.user.role, req.user.sub)]);
        return invoice;
    }

    @Put('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInvoiceDto, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.updateInvoice(id, dto, actorFrom(req));
    }

    @Delete('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Invoice deleted' })
    async remove(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        await this.invoiceService.deleteInvoice(id, actorFrom(req));
    }

    /**
     * Sends a refused invoice again once its cause is fixed, or one under review once somebody has
     * looked in SmartBill and found nothing issued — E16/S2. Audited: it is a person deciding.
     */
    @Post('/:id/fiscal/retry')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Retrimite factura în SmartBill',
        description: 'Doar din `failed` (refuzată) sau `review` (după ce cineva a verificat în SmartBill că nu a fost emisă).',
    })
    @ApiResponse({ status: 200, description: 'Queued again' })
    @ApiResponse({ status: 409, description: 'FISCAL_NOT_RETRYABLE' })
    async retryFiscal(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.fiscal.retry(id, actorFrom(req));
    }

    /**
     * Records the number SmartBill gave an invoice whose answer was lost — E16/S2. The platform does
     * not adopt a fiscal number it did not see come back; a person reads it in SmartBill and says so.
     */
    @Post('/:id/fiscal/confirm')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Confirmă numărul fiscal al unei facturi în verificare',
        description:
            'Doar din `review`: răspunsul SmartBill s-a pierdut, iar seria s-a mișcat. Seria e a platformei; se trimite numai numărul, așa cum îl arată SmartBill.',
    })
    @ApiResponse({ status: 200, description: 'Marked issued with that number' })
    @ApiResponse({ status: 409, description: 'FISCAL_NOT_UNDER_REVIEW' })
    async confirmFiscal(@Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmFiscalNumberDto, @Request() req: AuthenticatedRequest) {
        return this.fiscal.confirmIssued(id, dto.number, actorFrom(req));
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
    async issueFromSessions(@Body() dto: IssueMonthDto, @Request() req: AuthenticatedRequest) {
        return this.invoiceService.issueFromSessions(dto, actorFrom(req));
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

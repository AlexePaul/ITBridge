import { Body, Controller, Get, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe, HttpCode, Response, StreamableFile } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';

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
    async findInvoices(@Query() filter: FilterInvoiceDto, @Request() req) {
        return this.invoiceService.findInvoices(filter, req.user.role, req.user.sub);
    }

    @Get('/:id')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
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

    @Get('/:id/preview')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Invoice PDF preview retrieved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invoice not found' })
    async previewInvoicePdf(@Param('id', ParseIntPipe) id: number, @Request() req) {
        return this.invoiceService.getPreview(id);
    }

    @Get('/:id/pdf')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Invoice PDF retrieved' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Invoice not found' })
    async getInvoicePdf(@Param('id', ParseIntPipe) id: number, @Request() req) {
        const pdfBuffer = await this.invoiceService.getInvoicePdf(id, req.user.role, req.user.sub);

        return new StreamableFile(pdfBuffer, {
            type: 'application/pdf',
            disposition: 'attachment; filename="invoice.pdf"',
        });
    }
}

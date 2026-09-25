import { Body, Controller, Get, HttpCode, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { UpdatePaymentDto } from './dto/updatePayment.dto';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { actorFrom } from 'src/modules/audit/actor';
import { Role } from 'src/enum/role.enum';
import { FilterPaymentDto } from './dto/filterPayment.dto';
import { ConfirmPaymentRecordDto } from './dto/confirmPaymentRecord.dto';
import { PaymentFiscalService } from './payment-fiscal.service';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('payments')
export class PaymentController {
    constructor(
        private readonly paymentService: PaymentService,
        private readonly paymentFiscal: PaymentFiscalService,
    ) {}

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Payment created' })
    @ApiResponse({ status: 409, description: 'INVOICE_WAIVED — a waived month has nothing to pay' })
    async createPayment(@Body() dto: CreatePaymentDto, @Request() req: AuthenticatedRequest) {
        return this.paymentService.createPayment(dto, req.user.sub, actorFrom(req));
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findPayments(@Query() filter: FilterPaymentDto, @Request() req: AuthenticatedRequest) {
        return this.paymentService.findPayments(filter, req.user.role, req.user.sub);
    }

    /**
     * Where the payments stand with SmartBill — E16/S5. Declared before `/:id`: Nest matches in
     * declaration order, and `ParseIntPipe` would answer 400 to the word.
     */
    @Get('fiscal-queue')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async fiscalQueue() {
        return this.paymentFiscal.status();
    }

    @Post('/:id/fiscal/retry')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 409, description: 'PAYMENT_FISCAL_NOT_RETRYABLE — only a refused payment, one under review, or one owed to SmartBill' })
    async retryFiscal(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.paymentFiscal.retry(id, actorFrom(req));
    }

    @Post('/:id/fiscal/confirm')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 409, description: 'PAYMENT_FISCAL_NOT_UNDER_REVIEW' })
    @ApiResponse({ status: 400, description: 'RECEIPT_NUMBER_REQUIRED — a cash payment is confirmed with its receipt number' })
    async confirmFiscal(@Param('id', ParseIntPipe) id: number, @Body() dto: ConfirmPaymentRecordDto, @Request() req: AuthenticatedRequest) {
        return this.paymentFiscal.confirmRecorded(id, dto.number, actorFrom(req));
    }

    @Get('/:id')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.paymentService.findOne(id, req.user.role, req.user.sub);
    }

    @Put('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async updatePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentDto, @Request() req: AuthenticatedRequest) {
        return this.paymentService.updatePayment(id, dto, actorFrom(req));
    }

    @Delete('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Payment deleted' })
    @ApiResponse({ status: 409, description: 'PAYMENT_RECORDED_IN_SMARTBILL — reversed, not deleted, once SmartBill holds it' })
    async deletePayment(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        return this.paymentService.deletePayment(id, actorFrom(req));
    }
}

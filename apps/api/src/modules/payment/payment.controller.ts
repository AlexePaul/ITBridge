import { Body, Controller, Get, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { UpdatePaymentDto } from './dto/updatePayment.dto';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { FilterPaymentDto } from './dto/filterPayment.dto';

@Controller('payments')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) {}

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Payment created' })
    async createPayment(@Body() dto: CreatePaymentDto) {
        return this.paymentService.createPayment(dto);
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findPayments(@Query() filter: FilterPaymentDto, @Request() req) {
        return this.paymentService.findPayments(filter, req.user.role, req.user.sub);
    }

    @Get('/:id')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
        return this.paymentService.findOne(id, req.user.role, req.user.sub);
    }

    @Put('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    async updatePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentDto) {
        return this.paymentService.updatePayment(id, dto);
    }

    @Delete('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Payment deleted' })
    async deletePayment(@Param('id', ParseIntPipe) id: number) {
        return this.paymentService.deletePayment(id);
    }
}

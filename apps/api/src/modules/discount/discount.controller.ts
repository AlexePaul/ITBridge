import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { RolesGuard } from 'src/guards/role.guard';
import { Role } from 'src/enum/role.enum';
import { Roles } from 'src/decorators/role.decorator';
import { AuthGuard } from 'src/guards/auth.guard';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CreateDiscountDto } from './dto/createDiscount.dto';
import { UpdateDiscountDto } from './dto/updateDiscount.dto';
import { GrantReferralDiscountDto } from './dto/grantReferralDiscount.dto';

@Controller('discounts')
export class DiscountController {
    constructor(private readonly discountService: DiscountService) {}

    @Post()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Invoice created' })
    async createDiscount(@Body() createDiscountDto: CreateDiscountDto) {
        return this.discountService.createDiscount(createDiscountDto);
    }

    /**
     * Half off next month for one family — E20/S5, in one press.
     *
     * Declared before nothing in particular: there is no `:id` on POST here, so unlike
     * `ProjectController` this path cannot be swallowed by a parameter route. It is separate from
     * `POST /discounts` because the two have different shapes of decision behind them — that one
     * takes five fields and this one takes none.
     */
    @Post('/referral')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Referral discount granted for next month' })
    @ApiResponse({ status: 409, description: 'The family already has a percentage on that month' })
    async grantReferral(@Body() dto: GrantReferralDiscountDto) {
        return this.discountService.grantReferralNextMonth(dto.parentId);
    }

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'List of all discounts' })
    async findDiscounts() {
        return this.discountService.findDiscounts();
    }

    @Put('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Discount updated successfully' })
    async updateDiscount(@Param('id', ParseIntPipe) id: number, @Body() updateDiscountDto: UpdateDiscountDto) {
        return this.discountService.updateDiscount(id, updateDiscountDto);
    }

    @Delete('/:id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 204, description: 'Discount deleted successfully' })
    async deleteDiscount(@Param('id', ParseIntPipe) id: number) {
        await this.discountService.deleteDiscount(id);
    }
}

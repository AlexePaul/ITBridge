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
     * The referral reward, as three presses on one control — E20/S5.
     *
     * `+` adds a month, `−` takes the last one back, and the read renders both. All three answer
     * with the whole reward rather than with the row they touched, so the screen never has to work
     * out the new state from the old one plus what was pressed.
     *
     * **`referral/:parentId` is declared before `:id`**, the trap CLAUDE.md names in two other
     * controllers: `ParseIntPipe` on `:id` answers 400 to a word. Two segments would not match a
     * one-segment route anyway, but the order is the thing that keeps being true when somebody adds
     * a route later.
     */
    @Get('/referral/:parentId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'The months the referral reward covers' })
    async readReferral(@Param('parentId', ParseIntPipe) parentId: number) {
        return this.discountService.referralReward(parentId);
    }

    @Post('/referral')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'One more month at half price' })
    @ApiResponse({ status: 409, description: 'A percentage from somewhere else already sits on that month' })
    async grantReferral(@Body() dto: GrantReferralDiscountDto) {
        return this.discountService.grantReferralMonth(dto.parentId);
    }

    @Delete('/referral/:parentId')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'The last month taken back off the reward' })
    @ApiResponse({ status: 409, description: 'The family has no referral month left to take back' })
    async revokeReferral(@Param('parentId', ParseIntPipe) parentId: number) {
        return this.discountService.revokeReferralMonth(parentId);
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

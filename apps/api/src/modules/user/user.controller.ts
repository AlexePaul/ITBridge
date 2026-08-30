import { Controller, Get, Put, Post, UseGuards, Param, Body, Delete, HttpCode, ParseIntPipe } from '@nestjs/common';
import { ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/updateUser.dto';
import { RejectAccountDto } from './dto/rejectAccount.dto';
import { AccountApprovalService } from './account-approval.service';

@Controller('users')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly accountApprovalService: AccountApprovalService,
    ) {}

    @Get('')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'List of all users' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getAllUsers() {
        return this.userService.getAllUsers();
    }

    @Get('without-profile')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'List of users without profile' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getUsersWithoutProfile() {
        return this.userService.getUsersWithoutProfile();
    }

    /**
     * The approvals queue — E11/S2, second gate.
     *
     * Declared above `:id` on purpose: Nest matches in declaration order, so a `pending` route
     * placed after the parameter route would never be reached and `getUserById` would be handed the
     * string `'pending'` instead.
     */
    @Get('pending')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Parent accounts waiting for approval' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async getPendingAccounts() {
        return this.accountApprovalService.listPending();
    }

    @Post(':id/approve')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Account approved' })
    @ApiResponse({ status: 400, description: 'Not a parent account' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async approveAccount(@Param('id', ParseIntPipe) id: number) {
        return this.accountApprovalService.approve(id);
    }

    @Post(':id/reject')
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Account rejected' })
    @ApiResponse({ status: 400, description: 'Not a parent account, or already approved' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async rejectAccount(@Param('id', ParseIntPipe) id: number, @Body() rejectAccountDto: RejectAccountDto) {
        return this.accountApprovalService.reject(id, rejectAccountDto.reason);
    }

    @Get(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'User role updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUserById(@Param('id') id: number) {
        return this.userService.getUserById(id);
    }

    @Put(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiResponse({
        status: 409,
        description: 'Email or phone number already in use',
    })
    async updateUser(@Param('id') id: number, @Body() updateUserDto: UpdateUserDto) {
        return this.userService.updateUser(id, updateUserDto);
    }

    @Delete(':id')
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'User deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async deleteUser(@Param('id') id: number) {
        return this.userService.deleteUser(id);
    }
}

import { Controller, Get, Put, UseGuards, Param, Body, Delete } from '@nestjs/common';
import { ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/updateUser.dto';

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

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

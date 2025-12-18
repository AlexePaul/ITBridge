import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';

@Controller('user')
export class UserController {
  @Get('profile')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'User profile fetched successfully.',
  })
  async getProfile() {
    // Implementation for fetching user profile
    return { message: 'User profile data' };
  }
}

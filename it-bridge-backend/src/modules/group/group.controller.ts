import { Controller, Post, Get, Body, UseGuards, Put, Delete, HttpCode, Param } from '@nestjs/common';
import { GroupService } from './group.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { Role } from 'src/enum/role.enum';
import { Roles } from 'src/decorators/role.decorator';
import { RolesGuard } from 'src/guards/role.guard';
import { createGroupDto } from './dto/createGroup.dto';
import { Group } from 'src/entities/group.entity';
import { updateGroupDto } from './dto/updateGroup.dto';

@Controller('groups')
export class GroupController {
    constructor(private readonly groupService: GroupService) {}

    @Post()
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Group created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async createGroup(@Body() createGroupDto: createGroupDto) {
        return this.groupService.createGroup(createGroupDto);
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getGroups() {
        return this.groupService.getGroups();
    }

    @Get(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Group retrieved successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getGroupById(@Param('id') id: number) {
        return this.groupService.getGroupById(id);
    }

    @Put(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Group updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async updateGroup(@Param('id') id: number, @Body() updateGroupDto: updateGroupDto) {
        return this.groupService.updateGroup(id, updateGroupDto);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Group deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    async deleteGroup(@Param('id') id: number) {
        return this.groupService.deleteGroup(id);
    }
}

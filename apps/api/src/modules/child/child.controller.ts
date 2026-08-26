import { Body, Controller, Get, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe, HttpCode } from '@nestjs/common';
import { ChildService } from './child.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateChildDto } from './dto/createChild.dto';
import { FilterChildDto } from './dto/filterChild.dto';
import { UpdateChildDto } from './dto/updateChild.dto';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';

@Controller('children')
export class ChildController {
    constructor(private readonly childService: ChildService) {}

    @Post()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 201, description: 'Child created successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Children not found' })
    async createChild(@Body() createChildDto: CreateChildDto, @Request() req) {
        return this.childService.createChild(createChildDto, req.user.role, req.user.sub);
    }

    @Get()
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'List of all children' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async findChildren(@Query() filterChildDto: FilterChildDto, @Request() req) {
        return this.childService.findChildren(filterChildDto, req.user.role, req.user.sub);
    }

    @Put('/:childId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Child updated successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Child not found' })
    async updateChild(@Param('childId', ParseIntPipe) childId: number, @Body() updateChildDto: UpdateChildDto, @Request() req) {
        return this.childService.updateChild(childId, updateChildDto, req.user.role, req.user.sub);
    }

    @Delete('/:childId')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiResponse({ status: 200, description: 'Child deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Child not found' })
    async deleteChild(@Param('childId', ParseIntPipe) childId: number, @Request() req) {
        return this.childService.deleteChild(childId, req.user.role, req.user.sub);
    }

    @Post('/:childId/groups/:groupId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Child assigned to group successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Child or Group not found' })
    async assignChildToGroup(@Param('childId', ParseIntPipe) childId: number, @Param('groupId', ParseIntPipe) groupId: number, @Request() req) {
        return this.childService.assignChildToGroup(childId, groupId);
    }

    @Delete('/:childId/groups/:groupId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Child removed from group successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Child or Group not found' })
    async removeChildFromGroup(@Param('childId', ParseIntPipe) childId: number, @Param('groupId', ParseIntPipe) groupId: number, @Request() req) {
        return this.childService.removeChildFromGroup(childId, groupId);
    }
}

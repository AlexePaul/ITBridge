import { Body, Controller, Get, Post, UseGuards, Request, Query, Put, Delete, Param, ParseIntPipe } from '@nestjs/common';
import { ChildService } from './child.service';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { CreateChildDto } from './dto/createChild.dto';
import { FilterChildDto } from './dto/filterChild.dto';
import { UpdateChildDto } from './dto/updateChild.dto';

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
}

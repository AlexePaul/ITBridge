import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { LocationService } from './location.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { CreateLocationDto } from './dto/createLocation.dto';
import { UpdateLocationDto } from './dto/updateLocation.dto';

@Controller('locations')
export class LocationController {
    constructor(private readonly locationService: LocationService) {}

    @Post()
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Location created successfully' })
    @ApiResponse({ status: 409, description: 'Slug is already in use' })
    async createLocation(@Body() createLocationDto: CreateLocationDto) {
        return this.locationService.createLocation(createLocationDto);
    }

    // Readable by any authenticated user: a parent's group belongs to a room, and the room's
    // address is the single most practical thing they need from it. Nothing here is private.
    @Get()
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Locations retrieved successfully' })
    async getLocations() {
        return this.locationService.findLocations();
    }

    @Get(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Location retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    async getLocationById(@Param('id', ParseIntPipe) id: number) {
        return this.locationService.findLocationById(id);
    }

    @Put(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Location updated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    async updateLocation(@Param('id', ParseIntPipe) id: number, @Body() updateLocationDto: UpdateLocationDto) {
        return this.locationService.updateLocation(id, updateLocationDto);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Location deleted successfully' })
    @ApiResponse({ status: 409, description: 'Location still has rooms' })
    async deleteLocation(@Param('id', ParseIntPipe) id: number) {
        return this.locationService.deleteLocation(id);
    }
}

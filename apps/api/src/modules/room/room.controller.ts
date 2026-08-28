import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { CreateRoomDto } from './dto/createRoom.dto';
import { FilterRoomDto } from './dto/filterRoom.dto';
import { UpdateRoomDto } from './dto/updateRoom.dto';

@Controller('rooms')
export class RoomController {
    constructor(private readonly roomService: RoomService) {}

    @Post()
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 201, description: 'Room created successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    @ApiResponse({ status: 409, description: 'A room with this name already exists at this location' })
    async createRoom(@Body() createRoomDto: CreateRoomDto) {
        return this.roomService.createRoom(createRoomDto);
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Rooms retrieved successfully' })
    async getRooms(@Query() filters: FilterRoomDto) {
        return this.roomService.findRooms(filters);
    }

    @Get(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Room retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Room not found' })
    async getRoomById(@Param('id', ParseIntPipe) id: number) {
        return this.roomService.findRoomById(id);
    }

    @Put(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiResponse({ status: 200, description: 'Room updated successfully' })
    @ApiResponse({ status: 404, description: 'Room not found' })
    async updateRoom(@Param('id', ParseIntPipe) id: number, @Body() updateRoomDto: UpdateRoomDto) {
        return this.roomService.updateRoom(id, updateRoomDto);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @HttpCode(204)
    @ApiResponse({ status: 204, description: 'Room deleted successfully' })
    @ApiResponse({ status: 409, description: 'Room still hosts groups' })
    async deleteRoom(@Param('id', ParseIntPipe) id: number) {
        return this.roomService.deleteRoom(id);
    }
}

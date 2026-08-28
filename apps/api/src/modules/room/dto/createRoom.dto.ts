import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateRoomDto {
    @ApiProperty({ example: 'Sala 1', description: 'Unique within its location' })
    @IsString()
    @Length(1, 120)
    name: string;

    @ApiProperty({ example: 1, description: 'Id of the location this room belongs to' })
    @IsInt()
    locationId: number;

    @ApiProperty({ example: 10, description: 'How many children fit' })
    @IsInt()
    @Min(1)
    capacity: number;

    @ApiProperty({ required: false, example: 10, description: 'Number of computers in the room' })
    @IsOptional()
    @IsInt()
    @Min(0)
    computers?: number;

    @ApiProperty({ required: false, example: true })
    @IsOptional()
    @IsBoolean()
    hasProjector?: boolean;

    @ApiProperty({ required: false, example: true })
    @IsOptional()
    @IsBoolean()
    hasWhiteboard?: boolean;

    @ApiProperty({ required: false, example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

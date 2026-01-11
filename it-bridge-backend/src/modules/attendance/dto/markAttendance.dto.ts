import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsString, Matches, ValidateNested } from 'class-validator';

class ChildAttendanceDto {
    @ApiProperty({ example: 1, description: 'ID of the child' })
    @IsNumber()
    childId: number;

    @ApiProperty({ example: true, description: 'Presence status' })
    @IsBoolean()
    present: boolean;
}

export class markAttendanceDto {
    @ApiProperty({
        example: [
            { childId: 1, present: true, type: 'normal' },
            { childId: 2, present: false, type: 'catch-up' },
        ],
        description: 'Array of child IDs with presence status',
    })
    @ValidateNested({ each: true })
    childrenAttendance: ChildAttendanceDto[];

    @ApiProperty({ example: '2024-10-01', description: 'Date of attendance in YYYY-MM-DD format' })
    @IsString()
    date: string;

    @ApiProperty({ example: '09:00', description: 'Start time in HH:MM format' })
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be in HH:MM format' })
    startTime: string;
}

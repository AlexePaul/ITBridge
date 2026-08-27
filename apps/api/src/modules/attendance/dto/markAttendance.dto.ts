import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsNumber, IsString, Matches, ValidateNested } from 'class-validator';

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
    // `@Type` is not optional here. Without it class-transformer leaves the array as plain objects,
    // `@ValidateNested` has no class to validate against, and the decorators on ChildAttendanceDto
    // never run — the exact failure this DTO had before validation was switched on at all.
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ChildAttendanceDto)
    childrenAttendance: ChildAttendanceDto[];

    @ApiProperty({ example: '2024-10-01', description: 'Date of attendance in YYYY-MM-DD format' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
    date: string;

    @ApiProperty({ example: '09:00', description: 'Start time in HH:MM format' })
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be in HH:MM format' })
    startTime: string;
}

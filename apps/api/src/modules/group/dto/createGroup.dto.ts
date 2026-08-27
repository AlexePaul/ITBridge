import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsString, Matches } from 'class-validator';
import { Weekday } from 'src/enum/weekday.enum';

export class createGroupDto {
    @ApiProperty({ example: Weekday.MONDAY, enum: Weekday, description: 'ISO weekday (1 = Monday, 7 = Sunday)' })
    // `@IsInt()` is not redundant next to `@IsEnum`. A numeric enum carries a reverse mapping, so
    // `Object.values(Weekday)` holds the member names as well as the numbers and `@IsEnum` alone
    // accepts `"MONDAY"` — which then fails against an int column as a 500 rather than a 400.
    @IsInt()
    @IsEnum(Weekday)
    weekday: Weekday;

    @ApiProperty({ example: '09:00', description: 'Start time in HH:MM format' })
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be in HH:MM format' })
    startTime: string;

    @ApiProperty({ example: '17:00', description: 'End time in HH:MM format' })
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'endTime must be in HH:MM format' })
    endTime: string;

    @ApiProperty({ example: 10, description: 'Minimum age of group members' })
    @IsNumber()
    minAge: number;

    @ApiProperty({ example: 15, description: 'Maximum age of group members' })
    @IsNumber()
    maxAge: number;
}

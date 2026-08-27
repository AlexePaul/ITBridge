import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Weekday } from 'src/enum/weekday.enum';

/**
 * Every field is optional: this is a partial update. Before validation was enabled the decorators
 * did nothing, so the missing `@IsOptional()` went unnoticed — switching the pipe on would have
 * rejected every partial update with "startTime must be a string".
 */
export class updateGroupDto {
    @ApiProperty({ required: false, example: Weekday.MONDAY, enum: Weekday, description: 'ISO weekday (1 = Monday, 7 = Sunday)' })
    @IsOptional()
    @IsEnum(Weekday)
    weekday?: Weekday;

    @ApiProperty({ required: false, example: '09:00', description: 'Start time in HH:MM format' })
    @IsOptional()
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'startTime must be in HH:MM format' })
    startTime?: string;

    @ApiProperty({ required: false, example: '17:00', description: 'End time in HH:MM format' })
    @IsOptional()
    @IsString()
    @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, { message: 'endTime must be in HH:MM format' })
    endTime?: string;

    @ApiProperty({ required: false, example: 10, description: 'Minimum age of group members' })
    @IsOptional()
    @IsNumber()
    minAge?: number;

    @ApiProperty({ required: false, example: 15, description: 'Maximum age of group members' })
    @IsOptional()
    @IsNumber()
    maxAge?: number;

    @ApiProperty({ required: false, example: true, description: 'Indicates if the group is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

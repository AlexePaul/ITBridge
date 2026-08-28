import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Weekday } from 'src/enum/weekday.enum';

export class createGroupDto {
    @ApiProperty({ example: 'Scratch Începători', description: 'What an admin calls the group' })
    @IsString()
    @Length(1, 120)
    name: string;

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

    @ApiProperty({ example: 1, description: 'Id of the room the group meets in; the location follows from it' })
    @IsInt()
    roomId: number;

    @ApiProperty({ example: 10, description: 'Maximum enrolment; may not exceed the room capacity' })
    @IsInt()
    @Min(1)
    capacity: number;

    // Whole years. The bounds are wide on purpose — the school teaches from preschool up to
    // Bacalaureat — and only exist to catch a birth year typed into an age field.
    @ApiProperty({ example: 10, description: 'Minimum age of group members, in whole years' })
    @IsInt()
    @Min(3)
    @Max(21)
    minAge: number;

    @ApiProperty({ example: 15, description: 'Maximum age of group members, in whole years' })
    @IsInt()
    @Min(3)
    @Max(21)
    maxAge: number;
}

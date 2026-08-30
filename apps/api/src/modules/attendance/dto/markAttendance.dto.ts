import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsNumber, ValidateNested } from 'class-validator';

class ChildAttendanceDto {
    @ApiProperty({ example: 1, description: 'ID of the child' })
    @IsNumber()
    childId: number;

    @ApiProperty({ example: true, description: 'Presence status' })
    @IsBoolean()
    present: boolean;
}

/**
 * The body carries only who was there. **Which class it was is the `classSessionId` in the path.**
 *
 * `date` and `startTime` used to live here, and the pair identified the class by description: the
 * caller told the server what hour it thought the group met at, and the server believed it. Nothing
 * checked that a class was scheduled then, two callers could disagree by a minute and produce two
 * different classes, and a cancelled session was invisible to the whole flow. The session is a row
 * now, so the client names it instead of describing it.
 */
export class markAttendanceDto {
    @ApiProperty({
        // No `type` here: ChildAttendanceDto has no such field, the service decides regular versus
        // make-up from whether the child belongs to the group, and `forbidNonWhitelisted` would
        // refuse the property outright. The old example documented a body the API rejects.
        example: [
            { childId: 1, present: true },
            { childId: 2, present: false },
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
}

import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class PlaceReplacementDto {
    /**
     * The class the child is being moved into for that week — E12/S4.
     *
     * The only field, and deliberately so: every constraint on the move is a fact about this session
     * and the one that was missed, which the service reads for itself. Nothing here is a date, a
     * duration or a deadline somebody types, because none of those is anybody's to choose.
     */
    @ApiProperty({ example: 42, description: 'The session the child sits in on instead' })
    @IsInt()
    @IsPositive()
    classSessionId: number;
}

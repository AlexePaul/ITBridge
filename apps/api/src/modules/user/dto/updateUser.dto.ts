import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'src/enum/role.enum';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class UpdateUserDto {
    @ApiProperty({ example: 'username123', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 30)
    username?: string;

    // `@IsEnum` rather than `@IsString`: promoting a user is the one write that grants privileges,
    // so `'admin'` in the wrong case has to be a 400 rather than a row nobody can authenticate as.
    @ApiProperty({ example: Role.PARENT, enum: Role, required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}

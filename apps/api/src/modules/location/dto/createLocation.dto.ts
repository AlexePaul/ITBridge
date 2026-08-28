import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsLatitude, IsLongitude, IsNumber, IsOptional, IsPhoneNumber, IsString, Length, Matches } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class CreateLocationDto {
    @ApiProperty({ example: 'Drumul Taberei', description: 'How the location is referred to in running text' })
    @IsString()
    @Length(1, 120)
    name: string;

    @ApiProperty({ example: 'drumul-taberei', description: 'URL segment; lowercase letters, digits and single hyphens' })
    @IsString()
    @Length(1, 120)
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug must be lowercase words separated by single hyphens' })
    slug: string;

    @ApiProperty({ example: 'Strada Valea Oltului 73' })
    @IsString()
    @Length(1, 255)
    street: string;

    @ApiProperty({ example: 'București' })
    @IsString()
    @Length(1, 100)
    city: string;

    @ApiProperty({ required: false, example: 'Sector 6', description: 'Sector or county' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 100)
    district?: string;

    @ApiProperty({ required: false, example: '061971' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 20)
    postalCode?: string;

    @ApiProperty({ example: 44.415847, description: 'Decimal degrees' })
    @IsNumber()
    @IsLatitude()
    latitude: number;

    @ApiProperty({ example: 26.013556, description: 'Decimal degrees' })
    @IsNumber()
    @IsLongitude()
    longitude: number;

    // Same region as everywhere else in the application: numbers are written 0712345678 here, and
    // `@IsPhoneNumber()` with no region would reject exactly that.
    @ApiProperty({ required: false, example: '+40732273347' })
    @IsOptional()
    @EmptyToUndefined()
    @IsPhoneNumber('RO')
    phone?: string;

    @ApiProperty({ required: false, example: 'office@itbridgeschool.com' })
    @IsOptional()
    @EmptyToUndefined()
    @IsEmail()
    @Length(1, 255)
    email?: string;

    @ApiProperty({ required: false, example: 'Luni–vineri: 9:00–20:00', description: 'Only when they differ from the school-wide hours' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 255)
    openingHours?: string;

    @ApiProperty({ required: false, example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

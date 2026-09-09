import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { AuditModule } from 'src/modules/audit/audit.module';

@Module({
    // `AuditModule` because a discount is money given away, and the referral button makes it easy
    // to give twice by accident — E07/S3 writes down who, what and for which month.
    imports: [TypeOrmModule.forFeature([Discount, Profile]), JwtModule.register({}), AuditModule],
    controllers: [DiscountController],
    providers: [DiscountService, AuthGuard, RolesGuard],
})
export class DiscountModule {}

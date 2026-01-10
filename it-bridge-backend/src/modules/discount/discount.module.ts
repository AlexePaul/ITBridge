import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { Discount } from 'src/entities/discount.entity';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';

@Module({
    imports: [TypeOrmModule.forFeature([Discount]), JwtModule.register({})],
    controllers: [DiscountController],
    providers: [DiscountService, AuthGuard, RolesGuard],
})
export class DiscountModule {}

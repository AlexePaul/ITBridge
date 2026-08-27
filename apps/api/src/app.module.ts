import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { EntitiesModule } from './entities/entities.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ChildModule } from './modules/child/child.module';
import { GroupModule } from './modules/group/group.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { PaymentModule } from './modules/payment/payment.module';
import { DiscountModule } from './modules/discount/discount.module';
import { dataSourceOptions } from './data-source';

@Module({
    imports: [
        TypeOrmModule.forRoot(dataSourceOptions),
        AuthModule,
        UserModule,
        EntitiesModule,
        ProfileModule,
        ChildModule,
        GroupModule,
        AttendanceModule,
        InvoiceModule,
        PaymentModule,
        DiscountModule,
    ],
})
export class AppModule {}

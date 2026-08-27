import { MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { HealthModule } from './modules/health/health.module';
import { dataSourceOptions } from './data-source';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AppThrottlerGuard } from './common/app-throttler.guard';

@Module({
    imports: [
        // A generous global ceiling; the endpoints that actually need protecting carry their own,
        // much tighter limit via @Throttle. Without any of this, /auth/login accepted attempts as
        // fast as they arrived.
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
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
        HealthModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: AppThrottlerGuard,
        },
        {
            // One error shape for everything that leaves the API, and database errors never
            // reaching the client verbatim.
            provide: APP_FILTER,
            useClass: AllExceptionsFilter,
        },
        {
            // Registered here rather than in `main.ts` on purpose: as an APP_PIPE it applies to every
            // application built from this module, so the integration tests exercise validation too.
            // A pipe added only in `main.ts` would leave the tests running against unvalidated
            // bodies — which is how 22 DTO files ended up with decorators nobody had ever executed.
            provide: APP_PIPE,
            useValue: new ValidationPipe({
                whitelist: true, // strip properties no DTO declares
                forbidNonWhitelisted: true, // ...and reject the request that sent them
                transform: true, // hand the service a real DTO instance, not a bare object
                // `enableImplicitConversion` is deliberately off. It coerces before validating, so
                // `@IsString()` would accept the number 1234 by turning it into "1234" — which
                // makes most of the type decorators meaningless. Query strings that need to become
                // numbers say so explicitly, with `@Type(() => Number)` on the field.
            }),
        },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        // Runs before everything, so the id exists by the time the filter needs one.
        consumer.apply(RequestIdMiddleware).forRoutes('*');
    }
}

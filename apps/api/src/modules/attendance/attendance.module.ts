import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
    imports: [EntitiesModule, JwtModule.register({})],
    controllers: [AttendanceController],
    providers: [AttendanceService, AuthGuard, RolesGuard],
})
export class AttendanceModule {}

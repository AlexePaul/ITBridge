import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { JwtModule } from '@nestjs/jwt';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { Group } from 'src/entities/group.entity';
import { Child } from 'src/entities/child.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Attendance, Group, Child]), JwtModule.register({})],
    controllers: [AttendanceController],
    providers: [AttendanceService, AuthGuard, RolesGuard],
})
export class AttendanceModule {}

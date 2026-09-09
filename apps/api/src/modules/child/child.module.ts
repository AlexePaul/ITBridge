import { Module } from '@nestjs/common';
import { AuditModule } from 'src/modules/audit/audit.module';
import { ChildController } from './child.controller';
import { ChildService } from './child.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { Group } from 'src/entities/group.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Project } from 'src/entities/project.entity';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';

@Module({
    // `EnrollmentModule` because putting a child in a group is now opening an enrolment (E11/S1),
    // and `Child.group` has exactly one writer.
    // `AuditModule` because a child's name and date of birth changing leaves a trail — E07/S3.
    // Field names only: the values are held under a different retention rule and must not outlive
    // the family they belong to.
    // `Attendance` and `Project` because deleting a child cascades into both, and the register and
    // the bucket are the two things that must not go that way — see `deleteChild`.
    imports: [TypeOrmModule.forFeature([Child, Profile, Group, Attendance, Project]), EnrollmentModule, JwtModule.register({}), AuditModule],
    controllers: [ChildController],
    providers: [ChildService, AuthGuard, RolesGuard],
})
export class ChildModule {}

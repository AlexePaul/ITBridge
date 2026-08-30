import { Module } from '@nestjs/common';
import { ChildController } from './child.controller';
import { ChildService } from './child.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { RolesGuard } from 'src/guards/role.guard';
import { AuthGuard } from 'src/guards/auth.guard';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { Group } from 'src/entities/group.entity';
import { EnrollmentModule } from 'src/modules/enrollment/enrollment.module';

@Module({
    // `EnrollmentModule` because putting a child in a group is now opening an enrolment (E11/S1),
    // and `Child.group` has exactly one writer.
    imports: [TypeOrmModule.forFeature([Child, Profile, Group]), EnrollmentModule, JwtModule.register({})],
    controllers: [ChildController],
    providers: [ChildService, AuthGuard, RolesGuard],
})
export class ChildModule {}

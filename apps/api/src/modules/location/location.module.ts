import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
    imports: [EntitiesModule, JwtModule.register({})],
    controllers: [LocationController],
    providers: [LocationService, AuthGuard, RolesGuard],
})
export class LocationModule {}

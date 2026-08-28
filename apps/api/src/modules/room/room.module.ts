import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EntitiesModule } from 'src/entities/entities.module';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

@Module({
    imports: [EntitiesModule, JwtModule.register({})],
    controllers: [RoomController],
    providers: [RoomService, AuthGuard, RolesGuard],
})
export class RoomModule {}

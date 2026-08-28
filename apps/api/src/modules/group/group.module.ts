import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { EntitiesModule } from 'src/entities/entities.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';

@Module({
    // `EntitiesModule` rather than a `forFeature` of its own: the service now needs `Room` as well
    // as `Group`, and that module already re-exports every repository.
    imports: [EntitiesModule, JwtModule.register({})],
    controllers: [GroupController],
    providers: [GroupService, AuthGuard, RolesGuard],
})
export class GroupModule {}

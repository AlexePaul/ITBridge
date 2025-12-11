import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { EntitiesModule } from './entities/entities.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CommonModule } from './common/common.module';
import { DtoModule } from './common/dto/dto.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',       // database type
      host: '192.168.0.213',
      port: 6543,
      username: 'admin',
      password: 'admin1234',
      database: 'ITBridge',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,      // dev only: auto-create tables
    }),AuthModule, EntitiesModule, CommonModule, DtoModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { EntitiesModule } from './entities/entities.module';
import { DtoModule } from './common/dto/dto.module';

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
const dbUser = process.env.DB_USER || 'itbridge';
const dbPassword = process.env.DB_PASSWORD || 'dev_password';
const dbName = process.env.DB_NAME || 'itbridge_db';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: dbHost,
      port: dbPort,
      username: dbUser,
      password: dbPassword,
      database: dbName,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    AuthModule,
    UserModule,
    EntitiesModule,
    DtoModule,
  ],
})
export class AppModule {}

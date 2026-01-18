import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as Greenlock from 'greenlock-express';

async function bootstrap() {
    const greenlock = Greenlock.init({
        packageRoot: __dirname,
        configDir: './greenlock.d',
        maintainerEmail: process.env.MAINTAINER_EMAIL, // Replace with your email
        cluster: false,
    }).serve((app) => {
        // NestJS app initialization
        const config = new DocumentBuilder()
            .setTitle('ITBridge API')
            .setDescription('ITBridge authentication and user management API')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api', app, document);

        app.enableCors({
            origin: ['https://it-bridge-gamma.vercel.app', 'http://localhost:3000'],
            credentials: true,
        });

        const port = Number(process.env.PORT || 3000);
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server listening on https://itbridge.webhop.me:8990`);
        });
    });
}
bootstrap();

import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';

const DEFAULT_CORS_ORIGINS = ['https://itbridgeschool.com', 'http://localhost:3001'];

// Allowed origins come from CORS_ORIGINS, a comma-separated list, so Vercel previews and a future
// staging environment do not require a code change. Without the variable, the production domain and
// the local frontend remain.
function corsOrigins(): string[] {
    const raw = process.env.CORS_ORIGINS;
    if (!raw) {
        return DEFAULT_CORS_ORIGINS;
    }
    const origins = raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors({
        origin: corsOrigins(),
        credentials: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type, Accept, Authorization',
    });

    // Swagger configuration
    const config = new DocumentBuilder()
        .setTitle('ITBridge API')
        .setDescription('ITBridge authentication and user management API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    // Save Swagger JSON to a file
    fs.writeFileSync('./swagger.json', JSON.stringify(document, null, 2));

    const port = Number(process.env.PORT || 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`Server listening on http://0.0.0.0:${port}`);
}
bootstrap();

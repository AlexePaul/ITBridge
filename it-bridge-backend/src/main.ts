import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.enableCors({
        origin: ['https://itbridgeschool.com', 'http://localhost:3001'],
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

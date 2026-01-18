import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

async function bootstrap() {
    const certsDir = path.join(process.cwd(), 'certs');

    // Ensure certs directory exists
    if (!fs.existsSync(certsDir)) {
        fs.mkdirSync(certsDir, { recursive: true });
    }

    const keyPath = path.join(certsDir, 'key.pem');
    const certPath = path.join(certsDir, 'cert.pem');

    // Generate self-signed certificate if it doesn't exist
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.log('Generating self-signed certificate...');
        spawnSync('openssl', [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-keyout',
            keyPath,
            '-out',
            certPath,
            '-days',
            '365',
            '-nodes',
            '-subj',
            '/CN=itbridge.webhop.me',
        ]);
        console.log('Self-signed certificate generated successfully!');
    }

    const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };

    const app = await NestFactory.create(AppModule, { httpsOptions });

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

    app.enableCors({
        origin: ['http://localhost:3000', 'https://it-bridge-gamma.vercel.app'],
        credentials: true,
    });

    const port = Number(process.env.PORT || 3000);
    await app.listen(port, '0.0.0.0');
    console.log(`Server listening on https://0.0.0.0:${port}`);
}
bootstrap();

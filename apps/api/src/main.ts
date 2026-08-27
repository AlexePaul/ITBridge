import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { REQUEST_ID_HEADER } from './common/request-id.middleware';
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
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // The rate limiter keys on `req.ip`. Behind the Caddy reverse proxy this backend is heading for
    // (E01/S4), every request arrives from the proxy's own address, so without this the per-IP
    // limits become one shared bucket for the whole school: ten login attempts a minute across all
    // parents, and one bad actor locks everybody out. `1` trusts exactly one hop — the proxy we put
    // there ourselves — rather than believing any X-Forwarded-For a client cares to send.
    app.set('trust proxy', 1);

    // `onModuleDestroy` never ran without this, so SIGTERM killed the process outright: in-flight
    // requests cut mid-response, the connection pool left open, and the session purge timer never
    // cleared. `pm2 reload` sends exactly that signal.
    app.enableShutdownHooks();

    app.enableCors({
        origin: corsOrigins(),
        credentials: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        // The correlation id has to cross the CORS boundary in both directions or it does not
        // exist as far as the browser is concerned: without `exposedHeaders` the frontend cannot
        // read the id we return, and without it in `allowedHeaders` a request carrying one is
        // blocked at the preflight. Both halves of `RequestIdMiddleware` were unreachable from the
        // only client there is.
        allowedHeaders: `Content-Type, Accept, Authorization, ${REQUEST_ID_HEADER}`,
        exposedHeaders: [REQUEST_ID_HEADER],
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
void bootstrap();

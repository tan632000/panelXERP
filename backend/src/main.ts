import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';

import { HttpExceptionFilter } from '@kernel/shared/filters/http-exception.filter';
import { LoggerService } from '@kernel/shared/logger/logger.service';

import { validationExceptionFactory } from '@shared/utils/validation-error.util';

import { AppModule } from './app.module';

import type { NestExpressApplication } from '@nestjs/platform-express';

function parseCorsOrigin(raw?: string): boolean | string | string[] {
  const value = (raw || '').trim();
  if (!value || value === '*') return true;
  if (value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

const API_PREFIX = 'api/v1';
// Excel imports post their parsed rows as JSON, so the default leaves room for a large sheet.
const DEFAULT_BODY_LIMIT = '10mb';
const IMAGE_BODY_LIMIT = '50mb';
// Routes whose JSON body carries base64 images or a result file (CAPA, test lab, QC standards,
// hull cell); every other route keeps the small default so no caller can make the server buffer
// 50mb before authentication.
const IMAGE_BODY_ROUTES = [
  'capas',
  'test-labs',
  'htm-qc-standards',
  'fp-qc-standards',
  'ccdc-qc-standards',
  'vtk-qc-standards',
  'xlbm-hull-cells',
].map((route) => `/${API_PREFIX}/${route}`);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // nginx sits in front of every deployed backend; trusting its one hop makes `req.ip` the
  // client address from X-Forwarded-For instead of the proxy container's.
  app.set('trust proxy', 1);
  // Registered before Nest's own parser: it parses (and marks) the image routes' bodies first,
  // and body-parser skips a request whose body is already read.
  app.use(IMAGE_BODY_ROUTES, json({ limit: IMAGE_BODY_LIMIT }));
  app.useBodyParser('json', { limit: DEFAULT_BODY_LIMIT });
  const logger = app.get(LoggerService);
  app.useLogger(logger);

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
    // A throttled client reads it to wait out the block before retrying.
    exposedHeaders: ['Retry-After'],
  });
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const apiTitle = process.env.APP_DISPLAY_NAME || 'ERP Platform API';
  const swaggerConfig = new DocumentBuilder()
    .setTitle(apiTitle)
    .setDescription(`REST API — ${apiTitle}`)
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'x-api-key' },
      'mes-api-key',
    )
    // Declared so the document names where it is served; an empty `servers` is rejected.
    // The paths already carry the `/api/v1` prefix, so the server is the bare origin.
    .addServer('/', 'Current host')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = process.env.PORT || 8080;
  await app.listen(port);
  logger.log(`API running on http://localhost:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();

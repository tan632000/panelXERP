/**
 * Generate OpenAPI spec from NestJS app metadata.
 *
 * Usage (requires DB connection — e.g., docker-compose up):
 *   npx ts-node -r tsconfig-paths/register scripts/generate-openapi.ts
 *
 * CI usage (app must be running):
 *   curl -o docs/api/openapi.json http://localhost:8080/api/docs-json
 *   curl -o docs/api/openapi.yaml http://localhost:8080/api/docs-yaml
 *
 * Output: docs/api/openapi.json, docs/api/openapi.yaml
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '@src/app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle(process.env.APP_DISPLAY_NAME || 'ERP Platform API')
    .setDescription('REST API — ERP Hải Phòng Manufacturing Platform')
    .setVersion('1.0')
    .addBearerAuth()
    // Declared so the document names where it is served; an empty `servers` is rejected.
    // The paths already carry the `/api/v1` prefix, so the server is the bare origin.
    .addServer('/', 'Current host')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const outDir = path.resolve(__dirname, '../docs/api');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'openapi.json'),
    JSON.stringify(document, null, 2),
    'utf-8',
  );

  let jsYaml: { dump: (doc: unknown, opts?: unknown) => string };
  try {
    jsYaml = await import('js-yaml');
  } catch {
    console.log('ℹ️  js-yaml not installed, skipping YAML output');
    console.log(`✅ OpenAPI JSON → docs/api/openapi.json`);
    await app.close();
    return;
  }
  fs.writeFileSync(
    path.join(outDir, 'openapi.yaml'),
    jsYaml.dump(document, { indent: 2, lineWidth: 120 }),
    'utf-8',
  );

  console.log('✅ OpenAPI spec generated:');
  console.log(`   JSON → docs/api/openapi.json`);
  console.log(`   YAML → docs/api/openapi.yaml`);

  await app.close();
}

generate().catch((err: unknown) => {
  console.error('❌ OpenAPI generation failed. Is the database running?');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

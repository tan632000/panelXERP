"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const app_module_1 = require("../src/app.module");
async function generate() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle(process.env.APP_DISPLAY_NAME || 'ERP Platform API')
        .setDescription('REST API — ERP Hải Phòng Manufacturing Platform')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    const outDir = path.resolve(__dirname, '../docs/api');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'openapi.json'), JSON.stringify(document, null, 2), 'utf-8');
    let jsYaml;
    try {
        jsYaml = await import('js-yaml');
    }
    catch {
        console.log('ℹ️  js-yaml not installed, skipping YAML output');
        console.log(`✅ OpenAPI JSON → docs/api/openapi.json`);
        await app.close();
        return;
    }
    fs.writeFileSync(path.join(outDir, 'openapi.yaml'), jsYaml.dump(document, { indent: 2, lineWidth: 120 }), 'utf-8');
    console.log('✅ OpenAPI spec generated:');
    console.log(`   JSON → docs/api/openapi.json`);
    console.log(`   YAML → docs/api/openapi.yaml`);
    await app.close();
}
generate().catch((err) => {
    console.error('❌ OpenAPI generation failed. Is the database running?');
    console.error(`   ${err.message}`);
    process.exit(1);
});
//# sourceMappingURL=generate-openapi.js.map
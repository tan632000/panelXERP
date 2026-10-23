import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appTimezoneConfig from '@kernel/core/config/app-timezone.config';
import appConfig from '@kernel/core/config/app.config';
import awsConfig from '@kernel/core/config/aws.config';
import bullConfig from '@kernel/core/config/bull.config';
import databaseConfig from '@kernel/core/config/database.config';
import loggingConfig from '@kernel/core/config/logging.config';
import mailConfig from '@kernel/core/config/mail.config';
import redisConfig from '@kernel/core/config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Host npm run: ../.env (shared) → .env (backend overrides)
      envFilePath: [
        '../.env',
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        appTimezoneConfig,
        awsConfig,
        bullConfig,
        loggingConfig,
        mailConfig,
      ],
    }),
  ],
})
export class AppConfigModule {}

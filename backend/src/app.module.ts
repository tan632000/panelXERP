import { BullModule } from '@nestjs/bull';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from '@kernel/core/audit/audit.module';
import { AuthModule } from '@kernel/core/auth/auth.module';
import { JwtAuthGuard } from '@kernel/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import {
  resolveThrottleLimit,
  THROTTLE_TTL_MS,
  UserThrottlerGuard,
} from '@kernel/core/auth/guards/user-throttler.guard';
import { AppConfigModule } from '@kernel/core/config/config.module';
import { DatabaseModule } from '@kernel/core/database/database.module';
import { FilesModule } from '@kernel/core/files/files.module';
import { HealthModule } from '@kernel/core/health/health.module';
import { RolesModule } from '@kernel/core/roles/roles.module';
import { UsersModule } from '@kernel/core/users/users.module';
import { EventsModule } from '@kernel/platform/events/events.module';
import { loadExtensionModules } from '@kernel/platform/extensions/extension-loader';
import { FeaturesModule } from '@kernel/platform/features/features.module';
import { ENABLED_PLUGINS } from '@kernel/platform/plugins/enabled-plugins';
import { RequestContextMiddleware } from '@kernel/shared/middleware/request-context.middleware';
import { SharedModule } from '@kernel/shared/shared.module';

import { WebhooksModule } from '@webhooks/webhooks.module';

const pluginModules = ENABLED_PLUGINS.map((p) => p.module);
const extensionModules = loadExtensionModules();

@Module({
  imports: [
    AppConfigModule,
    ConfigModule,
    DatabaseModule,
    SharedModule,
    EventsModule,
    FeaturesModule,
    ThrottlerModule.forRoot([
      { ttl: THROTTLE_TTL_MS, limit: resolveThrottleLimit },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get('bull.redis'),
      }),
    }),
    AuthModule,
    UsersModule,
    RolesModule,
    HealthModule,
    FilesModule,
    AuditModule,
    // Plugin modules (loaded via registry)
    ...pluginModules,
    // Extension modules (auto-discovered from _extensions/)
    ...extensionModules,
    // Endpoints external partner systems call, apart from the user-facing API
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

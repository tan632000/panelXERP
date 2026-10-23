import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getFeatureMigrationGlobs } from '@kernel/platform/features/enabled-features';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('database.host');
        return {
          type: 'postgres' as const,
          ...(host
            ? {
                host,
                port: config.get<number>('database.port'),
                username: config.get<string>('database.user'),
                password: config.get<string>('database.password'),
                database: config.get<string>('database.name'),
              }
            : { url: config.get<string>('database.url') }),
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: process.env.RUN_MIGRATIONS === 'true',
          migrations: [
            'dist/kernel/core/database/migrations/*.js',
            ...getFeatureMigrationGlobs('dist'),
          ],
          logging: config.get<string>('app.nodeEnv') === 'development',
          // node-postgres defaults to 10 connections; every request already spends three
          // queries on auth, so under concurrent users requests queued for a free one.
          extra: { max: 20 },
        };
      },
    }),
  ],
})
export class DatabaseModule {}

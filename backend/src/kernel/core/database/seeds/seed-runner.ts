/**
 * Seed runner — runs seeds in order:
 *   1. Core seeds (users, roles) — every environment
 *   2. Plugin seeds (document sequences + feature data, ENABLED_PLUGINS order)
 *      — only when the seed scope is `all` (local by default)
 *
 * Usage:
 *   npx ts-node src/kernel/core/database/seeds/seed-runner.ts
 *   (or from a CLI script)
 *
 * Scope: SEED_SCOPE=core|all, defaulting to `all` on development/test/local and
 * `core` everywhere else (staging, production).
 */
import dataSource from '@kernel/core/database/data-source';
import { resolveSeedScope } from '@kernel/core/database/seeds/helpers/seed-scope';
import { seedRoles } from '@kernel/core/database/seeds/seed-roles';
import { seedUsers } from '@kernel/core/database/seeds/seed-users';
import { getAllPluginSeeds } from '@kernel/platform/plugins/enabled-plugins';

import type { SeedContext } from '@kernel/core/database/seeds/helpers/seed-context';
import type { DataSource } from 'typeorm';

async function runCoreSeeds(ctx: SeedContext): Promise<void> {
  const rolesByCode = await seedRoles(ctx);
  await seedUsers(ctx, rolesByCode);
}

async function runPluginSeeds(db: DataSource): Promise<void> {
  const seeds = getAllPluginSeeds();
  for (const seedFn of seeds) {
    await seedFn(db);
  }
}

async function main(): Promise<void> {
  try {
    const scope = resolveSeedScope();
    const db = await dataSource.initialize();
    const ctx: SeedContext = { dataSource: db };
    console.log(
      `[seed-runner] Scope: ${scope} (NODE_ENV=${process.env.NODE_ENV ?? 'unset'})`,
    );
    console.log('[seed-runner] Running core seeds...');
    await runCoreSeeds(ctx);
    console.log('[seed-runner] Core seeds done.');
    if (scope === 'all') {
      console.log('[seed-runner] Running plugin seeds...');
      await runPluginSeeds(db);
    } else {
      console.log(
        '[seed-runner] Skipping plugin data seeds — core scope. Set SEED_SCOPE=all to include them.',
      );
    }
    console.log('[seed-runner] All seeds completed.');
    await db.destroy();
  } catch (err) {
    console.error('[seed-runner] Failed:', err);
    process.exit(1);
  }
}

void main();

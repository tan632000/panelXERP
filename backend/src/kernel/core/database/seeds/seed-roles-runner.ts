/**
 * Roles-only seed runner — re-applies every role's name, description and permission set and
 * touches nothing else. Unlike `seed-runner`, it never runs `seedUsers`, so the accounts on a
 * live server keep their own email, name, title and password.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/kernel/core/database/seeds/seed-roles-runner.ts
 *   (or `make seed-role-prod` against staging/production)
 */
import dataSource from '@kernel/core/database/data-source';
import { seedRoles } from '@kernel/core/database/seeds/seed-roles';

async function main(): Promise<void> {
  try {
    const db = await dataSource.initialize();
    console.log('[seed-roles-runner] Updating role permissions...');
    const rolesByCode = await seedRoles({ dataSource: db });
    console.log(
      `[seed-roles-runner] ${rolesByCode.size} roles created or updated. Users untouched.`,
    );
    await db.destroy();
  } catch (err) {
    console.error('[seed-roles-runner] Failed:', err);
    process.exit(1);
  }
}

void main();

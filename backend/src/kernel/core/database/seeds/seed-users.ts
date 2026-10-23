import * as bcrypt from 'bcrypt';

import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

import type { SeedContext } from '@kernel/core/database/seeds/helpers/seed-context';
import type { Role } from '@kernel/core/users/entities/role.entity';

export interface SeedUserSpec {
  username: string;
  emailLocal: string;
  fullName: string;
  roleCode: string;
  department: string;
  title: string;
}

/** The value shipped in `backend/.env.example`; a production seed must never accept it. */
export const EXAMPLE_ADMIN_PASSWORD = 'ChangeMe-Dev-Only-123';

const MIN_ADMIN_PASSWORD_LENGTH = 12;

const ADMIN_USER_SPEC: SeedUserSpec = {
  username: 'admin',
  emailLocal: 'admin',
  fullName: 'Administrator',
  roleCode: 'admin',
  department: 'other',
  title: 'Administrator',
};

/**
 * One demo account per role, created outside production only. Feature tasks append an entry
 * when they add a role; demo accounts share the admin password of the environment.
 */
export const DEMO_USER_SPECS: readonly SeedUserSpec[] = [];

/**
 * The admin password comes from `SEED_ADMIN_PASSWORD` in every environment. Production
 * refuses a missing, short or example value so a published default never guards a live server.
 */
export function resolveAdminPassword(
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Used verbatim: trimming would hash a different value from the one the operator types.
  const password = env.SEED_ADMIN_PASSWORD;
  if (!password?.trim()) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be set to seed the admin account.',
    );
  }
  if (env.NODE_ENV === 'production') {
    if (
      password === EXAMPLE_ADMIN_PASSWORD ||
      password.toUpperCase().startsWith('CHANGE_ME') ||
      password.length < MIN_ADMIN_PASSWORD_LENGTH
    ) {
      throw new Error(
        `SEED_ADMIN_PASSWORD must not be the example value and must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters in production.`,
      );
    }
  }
  return password;
}

/** The accounts one seed run may create: the admin always, demo accounts outside production. */
export function seedUserSpecsFor(
  nodeEnv: string | undefined,
  demoUsers: readonly SeedUserSpec[] = DEMO_USER_SPECS,
): SeedUserSpec[] {
  return nodeEnv === 'production'
    ? [ADMIN_USER_SPEC]
    : [ADMIN_USER_SPEC, ...demoUsers];
}

function resolveSeedEmailDomain(): string {
  return process.env.SEED_EMAIL_DOMAIN?.trim() || 'example.com';
}

/**
 * Creates the accounts that do not exist yet and leaves every existing one alone — its
 * email, name, title, password, active flag and role links belong to whoever runs the server
 * now, so re-running the seed on staging/production must not reset them.
 */
export async function seedUsers(
  ctx: SeedContext,
  rolesByCode: Map<string, Role>,
  demoUsers: readonly SeedUserSpec[] = DEMO_USER_SPECS,
): Promise<void> {
  const password = resolveAdminPassword();
  const userRepo = ctx.dataSource.getRepository(User);
  const emailDomain = resolveSeedEmailDomain();
  const created: SeedUserSpec[] = [];
  let untouched = 0;

  for (const spec of seedUserSpecsFor(process.env.NODE_ENV, demoUsers)) {
    const role = rolesByCode.get(spec.roleCode);
    if (!role) {
      throw new Error(`[seed:users] Role not found: ${spec.roleCode}`);
    }

    // Soft-deleted rows included on purpose: username and email are unique across every row.
    const existing = await userRepo.findOne({
      where: { username: spec.username },
    });
    if (existing) {
      untouched += 1;
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // One transaction, so a failure between the two writes cannot leave an account without
    // its role — a later run skips an existing account and would never repair it.
    await ctx.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          username: spec.username,
          email: `${spec.emailLocal}@${emailDomain}`,
          passwordHash,
          fullName: spec.fullName,
          department: spec.department,
          title: spec.title,
          isActive: true,
        }),
      );
      await manager.save(
        manager.create(UserRole, { userId: user.id, roleId: role.id }),
      );
    });
    created.push(spec);
  }

  console.log(
    `[seed:users] ${created.length} users created, ${untouched} already existed and were left untouched (domain: ${emailDomain})`,
  );
  for (const spec of created) {
    console.log(`  - ${spec.username} → ${spec.roleCode} (${spec.fullName})`);
  }
}

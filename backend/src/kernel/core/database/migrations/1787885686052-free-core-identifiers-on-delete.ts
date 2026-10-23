import {
  createActiveUniqueIndex,
  dropNonPartialUnique,
} from '@kernel/core/database/free-on-delete-index.util';

import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Usernames, emails and role identifiers are released when the record is deleted.
 *
 * The column carried a plain `UNIQUE`, which counts deleted rows and so reserved the value
 * for good. A partial index over live rows lets an author re-enter it.
 */
export class FreeCoreIdentifiersOnDelete1787885686052 implements MigrationInterface {
  name = 'FreeCoreIdentifiersOnDelete1787885686052';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(dropNonPartialUnique('users', 'username'));
    await queryRunner.query(
      createActiveUniqueIndex(
        'uq_users_username_active',
        'users',
        'LOWER(username)',
      ),
    );
    await queryRunner.query(dropNonPartialUnique('users', 'email'));
    await queryRunner.query(
      createActiveUniqueIndex('uq_users_email_active', 'users', 'LOWER(email)'),
    );
    await queryRunner.query(dropNonPartialUnique('roles', 'code'));
    await queryRunner.query(
      createActiveUniqueIndex('uq_roles_code_active', 'roles', 'LOWER(code)'),
    );
    await queryRunner.query(dropNonPartialUnique('roles', 'name'));
    await queryRunner.query(
      createActiveUniqueIndex('uq_roles_name_active', 'roles', 'LOWER(name)'),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_users_username_active`);
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_users_email_active`);
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_roles_code_active`);
    await queryRunner.query(
      `ALTER TABLE roles ADD CONSTRAINT roles_code_key UNIQUE (code)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_roles_name_active`);
    await queryRunner.query(
      `ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name)`,
    );
  }
}

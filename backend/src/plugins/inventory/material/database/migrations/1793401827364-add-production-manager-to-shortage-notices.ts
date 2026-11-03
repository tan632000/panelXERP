import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The production manager now reads the shortage notice. Notices raised before this change name
 * purchasing only, so the role is appended to every open one that lacks it. The statements are
 * plain DML and repeat safely: a notice that already names the role is left alone.
 */
export const ADD_PRODUCTION_MANAGER_SQL = `
  UPDATE notifications
     SET role_codes = role_codes || '["productionManager"]'::jsonb
   WHERE event_type = 'inventory.order.short'
     AND status = 'open'
     AND is_deleted = false
     AND NOT (role_codes ? 'productionManager')
`;

export const REMOVE_PRODUCTION_MANAGER_SQL = `
  UPDATE notifications
     SET role_codes = role_codes - 'productionManager'
   WHERE event_type = 'inventory.order.short'
     AND status = 'open'
     AND is_deleted = false
     AND role_codes ? 'productionManager'
`;

export class AddProductionManagerToShortageNotices1793401827364 implements MigrationInterface {
  name = 'AddProductionManagerToShortageNotices1793401827364';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(ADD_PRODUCTION_MANAGER_SQL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(REMOVE_PRODUCTION_MANAGER_SQL);
  }
}

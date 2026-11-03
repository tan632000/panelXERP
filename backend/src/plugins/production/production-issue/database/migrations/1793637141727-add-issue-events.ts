import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The history entries an issue writes when it is reported and resolved. The values are only
 * added here, never used, so the migration's own transaction may add them.
 */
export class AddIssueEvents1793637141727 implements MigrationInterface {
  name = 'AddIssueEvents1793637141727';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['issue_reported', 'issue_resolved']) {
      await queryRunner.query(
        `ALTER TYPE production_order_event_type ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Enum values cannot be dropped; the unused values are harmless.
  }
}

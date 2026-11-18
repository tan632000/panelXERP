import type { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_ITEMS = [
  'Vỏ tủ, sơn và cánh cửa',
  'Siết lực đầu cốt, thanh cái',
  'Đấu dây đúng bản vẽ',
  'Đánh số dây và đầu cốt',
  'Đo điện trở cách điện',
  'Kiểm tra nối đất',
  'Thử không tải',
  'Thử chức năng và liên động',
  'Tem nhãn và biển tên',
  'Tài liệu kèm theo (bản vẽ, catalogue, biên bản thử)',
];

/**
 * The ten starting checklist items, inserted only into an empty table. A data migration rather
 * than a seed: staging and production run only the core seed scope, and a template a manager
 * has already edited (even to hide everything) must never get the defaults back.
 */
export class InsertDefaultQcChecklistItems1794585617331 implements MigrationInterface {
  name = 'InsertDefaultQcChecklistItems1794585617331';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO qc_checklist_items (name, position)
       SELECT item.name, item.position
         FROM unnest($1::text[]) WITH ORDINALITY AS item(name, position)
        WHERE NOT EXISTS (SELECT 1 FROM qc_checklist_items)`,
      [DEFAULT_ITEMS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM qc_checklist_items WHERE name = ANY($1::text[])`,
      [DEFAULT_ITEMS],
    );
  }
}

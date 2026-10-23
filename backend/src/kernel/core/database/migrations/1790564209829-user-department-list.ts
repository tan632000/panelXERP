import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns the account's department from free text into a value of a fixed list.
 *
 * Existing text is matched to the department it names; text naming none of them keeps its
 * account under `other`. The list is enforced by the API, not by a check constraint, so a
 * new department is a code change rather than a migration.
 */
export class UserDepartmentList1790564209829 implements MigrationInterface {
  name = 'UserDepartmentList1790564209829';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users SET department = CASE
        WHEN department ~* 'sale|kinh doanh' THEN 'sales'
        WHEN department ~* 'plan|ke hoach|kế hoạch' THEN 'planning'
        WHEN department ~* 'purchas|mua hang|mua hàng' THEN 'purchasing'
        WHEN department ~* 'qc|lab' THEN 'qcLab'
        WHEN department ~* 'techn|engineer|ky thuat|kỹ thuật' THEN 'technical'
        WHEN department ~* 'warehouse|^kho' THEN 'warehouse'
        WHEN department ~* 'mechanic|co khi|cơ khí' THEN 'mechanical'
        WHEN department ~* 'surface|xlbm|xử lý bề mặt' THEN 'surfaceTreatment'
        WHEN department ~* 'packag|dong goi|đóng gói' THEN 'packaging'
        WHEN department ~* 'account|ke toan|kế toán' THEN 'accounting'
        ELSE 'other'
      END
      WHERE department IS NOT NULL AND trim(department) <> ''
    `);
    await queryRunner.query(
      `UPDATE users SET department = NULL WHERE trim(department) = ''`,
    );
  }

  /** Back to readable text; the original wording of each account is not recoverable. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users SET department = CASE department
        WHEN 'sales' THEN 'Sales Department'
        WHEN 'planning' THEN 'Planning Department'
        WHEN 'purchasing' THEN 'Purchase Department'
        WHEN 'technical' THEN 'Technical Department'
        WHEN 'qcLab' THEN 'QC Lab Department'
        WHEN 'warehouse' THEN 'Warehouse'
        WHEN 'mechanical' THEN 'Mechanical Shop'
        WHEN 'surfaceTreatment' THEN 'Surface Treatment Shop'
        WHEN 'packaging' THEN 'Packaging Shop'
        WHEN 'accounting' THEN 'Accounting Department'
        WHEN 'other' THEN 'Other'
        ELSE department
      END
      WHERE department IS NOT NULL
    `);
  }
}

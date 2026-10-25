import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Approval, terms and the customer feedback log of a quotation.
 *
 * A version gains its own copy of the printed terms (existing versions get the company's
 * default wording), and who decided it, when, and why (the reason of a rejection or a
 * cancellation). Feedback is an append-only log per quotation, removed only with it.
 */
export class AddQuotationApproval1792902895752 implements MigrationInterface {
  name = 'AddQuotationApproval1792902895752';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_quotation_versions
        ADD COLUMN IF NOT EXISTS terms JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS decided_by INT REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS decision_reason VARCHAR(1000)
    `);
    await queryRunner.query(
      `
      UPDATE sales_quotation_versions
      SET terms = $1::jsonb
      WHERE terms = '[]'::jsonb
    `,
      [
        JSON.stringify([
          'Thời gian bảo hành thiết bị: 12 tháng',
          'Thời gian giao hàng: 1 - 2 tuần',
          'Địa điểm giao hàng: tại xưởng bên bán',
          'Thanh toán: Tạm ứng 50% sau ký hợp đồng, thanh toán số còn lại khi có thông báo giao hàng trước khi nhận hàng.',
          'Báo giá trên có giá trị trong vòng 15 ngày kể từ ngày chào giá',
        ]),
      ],
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_quotation_feedbacks (
        id SERIAL PRIMARY KEY,
        quotation_id INT NOT NULL REFERENCES sales_quotations(id) ON DELETE CASCADE,
        feedback_date DATE NOT NULL,
        channel VARCHAR(20) NOT NULL
          CONSTRAINT ck_sales_quotation_feedbacks_channel CHECK (
            channel IN ('phone', 'email', 'meeting', 'chat', 'other')
          ),
        content TEXT NOT NULL,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_quotation_feedbacks_quotation_id
        ON sales_quotation_feedbacks (quotation_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sales_quotation_feedbacks`);
    await queryRunner.query(`
      ALTER TABLE sales_quotation_versions
        DROP COLUMN IF EXISTS decision_reason,
        DROP COLUMN IF EXISTS decided_at,
        DROP COLUMN IF EXISTS decided_by,
        DROP COLUMN IF EXISTS terms
    `);
  }
}

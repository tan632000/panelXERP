import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quote requests (YC) and their timeline. The code is a document number, so its unique index
 * counts deleted rows too (no `is_deleted` filter): a number is never issued twice, and the
 * insert that loses a race on it is retried by the creator.
 *
 * `sales_request_activities` is an append-only timeline: rows are only inserted (and removed with
 * their request by cascade), so it carries `created_at` alone and not the soft-delete audit set,
 * like the kernel's `notification_reads` and `user_sessions`.
 */
export class InitRequest1792833774703 implements MigrationInterface {
  name = 'InitRequest1792833774703';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_requests (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL,
        customer_id INT NOT NULL REFERENCES customers(id),
        project_id INT REFERENCES projects(id),
        contact_id INT REFERENCES contacts(id),
        title VARCHAR(255) NOT NULL,
        technical_requirements TEXT,
        requested_delivery_date DATE,
        quotation_due_date DATE,
        sales_owner_id INT NOT NULL REFERENCES users(id),
        assigned_engineer_id INT REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CONSTRAINT ck_sales_requests_status CHECK (
            status IN ('draft', 'assigned', 'estimating', 'estimated', 'quoted', 'won', 'lost', 'cancelled')
          ),
        cancel_reason TEXT,
        lost_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by INT REFERENCES users(id),
        updated_by INT REFERENCES users(id),
        deleted_at TIMESTAMPTZ,
        deleted_by INT REFERENCES users(id),
        is_deleted BOOLEAN NOT NULL DEFAULT false
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_requests_code
        ON sales_requests (code)
    `);

    // Every Sales and Engineer list and lookup filters on one of these two owners.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_requests_sales_owner_id
        ON sales_requests (sales_owner_id)
        WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_requests_assigned_engineer_id
        ON sales_requests (assigned_engineer_id)
        WHERE is_deleted = false
    `);
    // The customer and project delete checks ask whether any live request points at them.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_requests_customer_id
        ON sales_requests (customer_id)
        WHERE is_deleted = false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_requests_project_id
        ON sales_requests (project_id)
        WHERE is_deleted = false AND project_id IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_request_activities (
        id SERIAL PRIMARY KEY,
        request_id INT NOT NULL REFERENCES sales_requests(id) ON DELETE CASCADE,
        action VARCHAR(40) NOT NULL,
        actor_id INT REFERENCES users(id),
        from_status VARCHAR(20),
        to_status VARCHAR(20),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_sales_request_activities_request_id
        ON sales_request_activities (request_id, id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_request_activities_request_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS sales_request_activities`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_requests_project_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_requests_customer_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_requests_assigned_engineer_id`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_sales_requests_sales_owner_id`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_sales_requests_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_requests CASCADE`);
  }
}

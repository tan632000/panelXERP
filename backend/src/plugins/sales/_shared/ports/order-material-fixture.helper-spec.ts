import { randomBytes } from 'crypto';

import type { DataSource } from 'typeorm';

export interface FixtureBomLine {
  /** Null for a legacy line the backfill could not link. */
  itemId: number | null;
  itemCode: string;
  /** Quantity for one panel, as numeric text. */
  quantity: string;
}

export interface FixturePanel {
  tag: string;
  quantity: number;
  bomLines: FixtureBomLine[];
}

export interface FixtureOrder {
  ownerUsername: string;
  status?: string;
  deliveryDate?: string | null;
  panels: FixturePanel[];
}

export interface OrderMaterialFixture {
  tag: string;
  userId(username: string): Promise<number>;
  /** An order of a fresh request owned by the named seeded account. */
  createOrder(spec: FixtureOrder): Promise<number>;
  /** Removes every sales row this fixture created (lines go with their order). */
  cleanup(): Promise<void>;
}

/**
 * Sales orders written straight to the tables, with the chain their foreign keys need
 * (customer, request, estimate, quotation version) and nothing else. Named `*.helper-spec.ts`
 * so the production build leaves it out and jest does not run it as a test.
 */
export function orderMaterialFixture(
  dataSource: DataSource,
): OrderMaterialFixture {
  const tag = `OM${randomBytes(4).toString('hex')}`;
  const requestIds: number[] = [];
  const customerIds: number[] = [];

  const one = async (sql: string, params: unknown[]): Promise<number> => {
    const [row]: Array<{ id: number }> = await dataSource.query(
      `${sql} RETURNING id`,
      params,
    );
    return row.id;
  };
  const userId = async (username: string): Promise<number> => {
    const [row]: Array<{ id: number }> = await dataSource.query(
      `SELECT id FROM users WHERE username = $1`,
      [username],
    );
    if (!row) {
      throw new Error(
        `The seeded ${username} account is missing: run \`npm run seed\`.`,
      );
    }
    return row.id;
  };

  return {
    tag,
    userId,
    async createOrder(spec) {
      const n = requestIds.length + 1;
      const owner = await userId(spec.ownerUsername);
      const customer = await one(
        `INSERT INTO customers (code, name, sales_owner_id) VALUES ($1, $2, $3)`,
        [`${tag}-C${n}`, `Khách ${tag} ${n}`, owner],
      );
      customerIds.push(customer);
      const request = await one(
        `INSERT INTO sales_requests (code, customer_id, title, sales_owner_id, status)
         VALUES ($1, $2, 'Material spec', $3, 'won')`,
        [`YC_${tag}_${n}`, customer, owner],
      );
      requestIds.push(request);
      const estimate = await one(
        `INSERT INTO sales_estimates (code, request_id) VALUES ($1, $2)`,
        [`DT_${tag}_${n}`, request],
      );
      const revision = await one(
        `INSERT INTO sales_estimate_revisions (estimate_id, revision, status)
         VALUES ($1, 1, 'submitted')`,
        [estimate],
      );
      const quotation = await one(
        `INSERT INTO sales_quotations (code, request_id, estimate_id) VALUES ($1, $2, $3)`,
        [`BG_${tag}_${n}`, request, estimate],
      );
      const version = await one(
        `INSERT INTO sales_quotation_versions
           (quotation_id, ver, estimate_revision_id, estimate_revision, status)
         VALUES ($1, 1, $2, 1, 'customer_confirmed')`,
        [quotation, revision],
      );
      const order = await one(
        `INSERT INTO sales_orders
           (code, quotation_id, quotation_version_id, quotation_ver, request_id, estimate_id,
            estimate_revision_id, estimate_revision, customer_id, customer_name, project_name,
            status, delivery_date, subtotal, discount_amount, vat_amount, total)
         VALUES ($1, $2, $3, 1, $4, $5, $6, 1, $7, $8, 'Dự án spec', $9, $10,
                 1000000, 0, 80000, 1080000)`,
        [
          `DH_${tag}_${n}`,
          quotation,
          version,
          request,
          estimate,
          revision,
          customer,
          `Khách ${tag} ${n}`,
          spec.status ?? 'open',
          spec.deliveryDate ?? null,
        ],
      );
      for (const panel of spec.panels) {
        const line = await one(
          `INSERT INTO sales_order_lines (order_id, tag, quantity, unit_price, amount)
           VALUES ($1, $2, $3, 500000, 1000000)`,
          [order, panel.tag, panel.quantity],
        );
        for (const bom of panel.bomLines) {
          await dataSource.query(
            `INSERT INTO sales_order_bom_lines
               (line_id, item_id, item_code, item_name, item_unit, quantity)
             VALUES ($1, $2, $3, 'Material spec item', 'Cái', $4)`,
            [line, bom.itemId, bom.itemCode, bom.quantity],
          );
        }
      }
      return order;
    },
    async cleanup() {
      if (requestIds.length > 0) {
        for (const table of [
          'sales_orders',
          'sales_quotations',
          'sales_estimates',
        ]) {
          await dataSource.query(
            `DELETE FROM ${table} WHERE request_id = ANY($1)`,
            [requestIds],
          );
        }
        await dataSource.query(
          `DELETE FROM sales_requests WHERE id = ANY($1)`,
          [requestIds],
        );
        requestIds.length = 0;
      }
      if (customerIds.length > 0) {
        await dataSource.query(`DELETE FROM customers WHERE id = ANY($1)`, [
          customerIds,
        ]);
        customerIds.length = 0;
      }
    },
  };
}

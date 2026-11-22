import request from 'supertest';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  PNG,
  storageFake,
  type StorageFake,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import { InstallationPhoto } from '@plugins/delivery/installation/entities/installation-photo.entity';
import { Installation } from '@plugins/delivery/installation/entities/installation.entity';
import { InstallationPhotoController } from '@plugins/delivery/installation/installation-photo.controller';
import { InstallationController } from '@plugins/delivery/installation/installation.controller';
import { InstallationAccess } from '@plugins/delivery/installation/services/installation-access.service';
import { InstallationPhotoService } from '@plugins/delivery/installation/services/installation-photo.service';
import { InstallationQueryService } from '@plugins/delivery/installation/services/installation-query.service';
import { InstallationService } from '@plugins/delivery/installation/services/installation.service';
import {
  openHarnessWithProgress,
  type ProductionTestActor,
  type ProductionTestHarness,
} from '@plugins/production/_shared/finished-unit-kit.helper-spec';

export interface PhotoUpload {
  name?: string;
  bytes?: Buffer;
}

export interface InstallationHarness {
  h: ProductionTestHarness;
  /** Object storage in memory, as the photo service sees it. */
  storage: StorageFake;
  /** An order (of sales_a) written straight to the tables, in the given status. */
  orderIn(status: string): Promise<number>;
  setOrderStatus(orderId: number, status: string): Promise<void>;
  /** Sets the order's customer address and, when given, gives it a project with this site address. */
  setAddresses(
    orderId: number,
    addresses: { customer?: string; project?: string },
  ): Promise<void>;
  create(
    orderId: number,
    body?: object,
    as?: ProductionTestActor,
  ): request.Test;
  patch(id: number, body: object, as?: ProductionTestActor): request.Test;
  start(id: number, as?: ProductionTestActor): request.Test;
  finish(id: number, as?: ProductionTestActor): request.Test;
  get(path: string, as?: ProductionTestActor): request.Test;
  /** Multipart upload of one file; defaults to a small PNG. */
  upload(
    id: number,
    file?: PhotoUpload,
    as?: ProductionTestActor,
  ): request.Test;
  /** A planned installation of a fresh in-production order; asserts the create succeeded. */
  planned(): Promise<{ id: number; orderId: number }>;
  /** Fills an installation with photo rows, as earlier uploads would have left it. */
  addPhotoRows(installationId: number, count: number): Promise<void>;
  photoRows(installationId: number): Promise<number>;
  statusOf(installationId: number): Promise<string>;
  /** Lets an actor use a permission its role lacks, for the length of `run`. */
  withGrant<T>(
    as: ProductionTestActor,
    permission: string,
    run: () => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

/**
 * The production harness (which brings the order tables, the order port and the scope service)
 * with the installation feature mounted. Orders are written straight to the tables, so no cabinet
 * is needed. Named `*.helper-spec.ts` so the production build leaves it out and jest does not run
 * it as a test.
 */
export async function openInstallationHarness(): Promise<InstallationHarness> {
  const storage = storageFake();
  const h = await openHarnessWithProgress([Installation, InstallationPhoto], {
    controllers: [InstallationController, InstallationPhotoController],
    providers: [
      InstallationAccess,
      InstallationQueryService,
      InstallationService,
      InstallationPhotoService,
      { provide: S3StorageService, useValue: storage },
    ],
  });
  const orderIds: number[] = [];
  const projectIds: number[] = [];

  const harness: InstallationHarness = {
    h,
    storage,
    async orderIn(status) {
      const orderId = await h.newOrder({ status });
      orderIds.push(orderId);
      return orderId;
    },
    async setOrderStatus(orderId, status) {
      await h.dataSource.query(
        `UPDATE sales_orders SET status = $2 WHERE id = $1`,
        [orderId, status],
      );
    },
    async setAddresses(orderId, { customer, project }) {
      await h.dataSource.query(
        `UPDATE sales_orders SET customer_address = $2 WHERE id = $1`,
        [orderId, customer ?? null],
      );
      if (project === undefined) return;
      const [row]: Array<{ id: number }> = await h.dataSource.query(
        `INSERT INTO projects (code, customer_id, name, site_address)
         SELECT $2, customer_id, 'Dự án spec', $3 FROM sales_orders WHERE id = $1
         RETURNING id`,
        [orderId, `PRJ_INST_${orderId}`, project],
      );
      projectIds.push(row.id);
      await h.dataSource.query(
        `UPDATE sales_orders SET project_id = $2 WHERE id = $1`,
        [orderId, row.id],
      );
    },
    create: (orderId, body = {}, as = 'storekeeper') =>
      h.post(`/delivery/orders/${orderId}/installation`, body, as),
    patch: (id, body, as = 'storekeeper') =>
      h.patch(`/delivery/installations/${id}`, body, as),
    start: (id, as = 'storekeeper') =>
      h.post(`/delivery/installations/${id}/start`, {}, as),
    finish: (id, as = 'storekeeper') =>
      h.post(`/delivery/installations/${id}/finish`, {}, as),
    get: (path, as = 'storekeeper') => h.get(path, as),
    upload: (id, file = {}, as = 'storekeeper') =>
      request(h.app.getHttpServer())
        .post(`/delivery/installations/${id}/photos`)
        .set('x-test-actor', h.token(as))
        .attach('file', file.bytes ?? PNG, file.name ?? 'site.png'),
    async planned() {
      const orderId = await harness.orderIn('in_production');
      const res = await harness.create(orderId).expect(201);
      return { id: (res.body as { id: number }).id, orderId };
    },
    async addPhotoRows(installationId, count) {
      await h.dataSource.query(
        `INSERT INTO installation_photos
           (installation_id, storage_key, content_type, file_name, size_bytes)
         SELECT $1, 'delivery/installation-photo/seeded/' || n || '.png', 'image/png', 'seeded.png', 4
           FROM generate_series(1, $2::int) AS n`,
        [installationId, count],
      );
    },
    async photoRows(installationId) {
      const [row]: Array<{ n: string }> = await h.dataSource.query(
        `SELECT COUNT(*) AS n FROM installation_photos WHERE installation_id = $1`,
        [installationId],
      );
      return Number(row.n);
    },
    async statusOf(installationId) {
      const [row]: Array<{ status: string }> = await h.dataSource.query(
        `SELECT status FROM installations WHERE id = $1`,
        [installationId],
      );
      return row.status;
    },
    async withGrant(as, permission, run) {
      const actor = h.actors[as];
      const before = actor.permissions;
      actor.permissions = [...before, permission];
      try {
        return await run();
      } finally {
        actor.permissions = before;
      }
    },
    async close() {
      if (orderIds.length > 0) {
        await h.dataSource.query(
          `DELETE FROM installation_photos
            WHERE installation_id IN (SELECT id FROM installations WHERE order_id = ANY($1))`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM installations WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      if (projectIds.length > 0) {
        await h.dataSource.query(
          `UPDATE sales_orders SET project_id = NULL WHERE project_id = ANY($1)`,
          [projectIds],
        );
        await h.dataSource.query(`DELETE FROM projects WHERE id = ANY($1)`, [
          projectIds,
        ]);
      }
      await h.close();
    },
  };
  return harness;
}

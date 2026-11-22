import request from 'supertest';

import { S3StorageService } from '@shared/services/s3-storage.service';

import {
  PDF,
  storageFake,
  type StorageFake,
} from '@plugins/delivery/_shared/delivery-storage.helper-spec';
import { AcceptanceController } from '@plugins/delivery/acceptance/acceptance.controller';
import { AcceptanceFile } from '@plugins/delivery/acceptance/entities/acceptance-file.entity';
import { Acceptance } from '@plugins/delivery/acceptance/entities/acceptance.entity';
import { AcceptanceAccess } from '@plugins/delivery/acceptance/services/acceptance-access.service';
import { AcceptanceQueryService } from '@plugins/delivery/acceptance/services/acceptance-query.service';
import { AcceptanceService } from '@plugins/delivery/acceptance/services/acceptance.service';
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
import { vnToday } from '@plugins/production/_shared/utils/vn-today.util';

export interface AcceptanceUpload {
  representativeName?: string;
  signedDate?: string;
  files?: Array<{ name: string; bytes: Buffer }>;
}

export interface AcceptanceHarness {
  h: ProductionTestHarness;
  /** Object storage in memory, as the acceptance service sees it. */
  storage: StorageFake;
  /** An order (of sales_a) written straight to the tables, in the given status. */
  orderIn(status: string): Promise<number>;
  /** A delivered order of sales_a, with a received delivery note of the given date when asked. */
  deliveredOrder(receivedDate?: string): Promise<number>;
  /** An installation row of the order in the given status, as the installation feature leaves it. */
  addInstallation(orderId: number, status: string): Promise<void>;
  /** Multipart create; the body defaults to valid minutes of today with one PDF. */
  accept(
    orderId: number,
    body?: AcceptanceUpload,
    as?: ProductionTestActor,
  ): request.Test;
  /** POST of the installation create of the installation feature, as the storekeeper. */
  createInstallation(orderId: number): request.Test;
  get(path: string, as?: ProductionTestActor): request.Test;
  /** Creates the minutes of a fresh delivered order; asserts it worked. */
  accepted(): Promise<{ orderId: number; fileId: number }>;
  acceptanceRows(orderId: number): Promise<number>;
  /** `change` values of the order's follower notices as the actor reads them. */
  changes(as: ProductionTestActor, orderId: number): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * The production harness (which brings the order tables, the order port and the scope service)
 * with the acceptance and installation features mounted. Orders, notes and installations are
 * written straight to the tables, so no cabinet is needed. Named `*.helper-spec.ts` so the
 * production build leaves it out and jest does not run it as a test.
 */
export async function openAcceptanceHarness(): Promise<AcceptanceHarness> {
  const storage = storageFake();
  const h = await openHarnessWithProgress(
    [Acceptance, AcceptanceFile, Installation, InstallationPhoto],
    {
      controllers: [
        AcceptanceController,
        InstallationController,
        InstallationPhotoController,
      ],
      providers: [
        AcceptanceAccess,
        AcceptanceQueryService,
        AcceptanceService,
        InstallationAccess,
        InstallationQueryService,
        InstallationService,
        InstallationPhotoService,
        { provide: S3StorageService, useValue: storage },
      ],
    },
  );
  const orderIds: number[] = [];
  let noteSeq = 0;

  const harness: AcceptanceHarness = {
    h,
    storage,
    async orderIn(status) {
      const orderId = await h.newOrder({ status });
      orderIds.push(orderId);
      return orderId;
    },
    async deliveredOrder(receivedDate) {
      const orderId = await harness.orderIn('delivered');
      if (receivedDate) {
        noteSeq += 1;
        await h.dataSource.query(
          `INSERT INTO delivery_notes (code, order_id, status, received_date)
           VALUES ($1, $2, 'received', $3)`,
          [`PGH_ACC_${orderId}_${noteSeq}`, orderId, receivedDate],
        );
      }
      return orderId;
    },
    async addInstallation(orderId, status) {
      await h.dataSource.query(
        `INSERT INTO installations (order_id, status) VALUES ($1, $2)`,
        [orderId, status],
      );
    },
    accept(orderId, body = {}, as = 'salesA') {
      const req = request(h.app.getHttpServer())
        .post(`/delivery/orders/${orderId}/acceptance`)
        .set('x-test-actor', h.token(as));
      const fields = {
        representativeName: 'Tran Van B',
        signedDate: vnToday(),
        ...body,
      };
      for (const key of ['representativeName', 'signedDate'] as const) {
        const value = fields[key];
        if (value !== undefined) req.field(key, value);
      }
      for (const file of body.files ?? [{ name: 'minutes.pdf', bytes: PDF }]) {
        req.attach('files', file.bytes, file.name);
      }
      return req;
    },
    createInstallation: (orderId) =>
      h.post(`/delivery/orders/${orderId}/installation`, {}, 'storekeeper'),
    get: (path, as = 'salesA') => h.get(path, as),
    async accepted() {
      const orderId = await harness.deliveredOrder();
      await harness.accept(orderId).expect(201);
      const [file]: Array<{ id: number }> = await h.dataSource.query(
        `SELECT f.id FROM acceptance_files f
           JOIN acceptances a ON a.id = f.acceptance_id WHERE a.order_id = $1`,
        [orderId],
      );
      return { orderId, fileId: file.id };
    },
    async acceptanceRows(orderId) {
      const [row]: Array<{ n: string }> = await h.dataSource.query(
        `SELECT COUNT(*) AS n FROM acceptances WHERE order_id = $1`,
        [orderId],
      );
      return Number(row.n);
    },
    async changes(as, orderId) {
      return (await h.notices(as, orderId))
        .map((notice) => notice.payload.change)
        .filter((change): change is string => typeof change === 'string');
    },
    async close() {
      if (orderIds.length > 0) {
        await h.dataSource.query(
          `DELETE FROM acceptance_files
            WHERE acceptance_id IN (SELECT id FROM acceptances WHERE order_id = ANY($1))`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM acceptances WHERE order_id = ANY($1)`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM installation_photos
            WHERE installation_id IN (SELECT id FROM installations WHERE order_id = ANY($1))`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM installations WHERE order_id = ANY($1)`,
          [orderIds],
        );
        await h.dataSource.query(
          `DELETE FROM delivery_notes WHERE order_id = ANY($1)`,
          [orderIds],
        );
      }
      await h.close();
    },
  };
  return harness;
}

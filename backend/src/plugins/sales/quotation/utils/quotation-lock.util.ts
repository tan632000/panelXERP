import { NotFoundException } from '@nestjs/common';

import { QuotationVersion } from '@plugins/sales/quotation/entities/quotation-version.entity';
import { Quotation } from '@plugins/sales/quotation/entities/quotation.entity';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type { DataScopeService } from '@shared/services/data-scope.service';
import type { EntityManager } from 'typeorm';

export const QUOTATION_LABEL = 'Quotation';

/** What a write works on: the locked request and header, and the newest version. */
export interface LockedQuotation {
  quotation: Quotation;
  request: SalesRequest;
  version: QuotationVersion;
}

/**
 * Locks the quotation's request row and then its header, both `FOR UPDATE` for the rest of the
 * transaction, checks the actor's data scope reaches the request (404 otherwise) and reads the
 * newest version under those locks.
 *
 * The request comes first because the request's own close holds it before it calls the
 * quotation's close hook, which takes the header; and every write here records a request
 * activity, whose foreign key needs a share of the request row that a held `FOR UPDATE` would
 * refuse. Taking the header first would therefore deadlock against a request close. The one
 * order for the sales chain is estimate → request → quotation header.
 */
export async function lockQuotation(
  manager: EntityManager,
  dataScope: DataScopeService,
  id: number,
  actor: AuthUserPayload,
): Promise<LockedQuotation> {
  const quotationRepo = manager.getRepository(Quotation);

  const head = await quotationRepo.findOne({ where: { id, isDeleted: false } });
  if (!head) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
  const request = dataScope.assertVisible(
    actor,
    await manager.getRepository(SalesRequest).findOne({
      where: { id: head.requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    }),
    QUOTATION_LABEL,
  );

  const quotation = await quotationRepo.findOne({
    where: { id, isDeleted: false },
    lock: { mode: 'pessimistic_write' },
  });
  if (!quotation) throw new NotFoundException(`${QUOTATION_LABEL} not found`);
  const version = await manager.getRepository(QuotationVersion).findOne({
    where: { quotationId: quotation.id, ver: quotation.latestVer },
  });
  if (!version) throw new NotFoundException('Version not found');
  return { quotation, request, version };
}

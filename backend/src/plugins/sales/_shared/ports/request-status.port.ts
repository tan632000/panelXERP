import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { recordRequestActivity } from '@plugins/sales/_shared/utils/request-activity.util';
import { REQUEST_STATUS_TRANSITIONS } from '@plugins/sales/request/constants/request-status-transitions.constant';
import { SalesRequest } from '@plugins/sales/request/entities/request.entity';
import { RequestStatus } from '@plugins/sales/request/enums/request-status.enum';

import type { EntityManager } from 'typeorm';

export interface AdvanceRequestOptions {
  /** Who caused the move, for the request's timeline. */
  actorId?: number | null;
  note?: string | null;
}

/**
 * How the estimate, quotation and order features move a request along: synchronously, on the
 * caller's own transaction, so the request and the document that moved it commit together or
 * not at all. Only notifications wait for the commit.
 */
@Injectable()
export class RequestStatusPort {
  /**
   * Moves the request to `to`. Already there is a no-op, so a retried step does not fail;
   * any move the table does not list answers 409, and an unknown request 404.
   *
   * The row is locked for the rest of the transaction, so two features advancing the same
   * request cannot both act on the status they each read.
   */
  async advance(
    manager: EntityManager,
    requestId: number,
    to: RequestStatus,
    options: AdvanceRequestOptions = {},
  ): Promise<SalesRequest> {
    const repo = manager.getRepository(SalesRequest);
    const request = await repo.findOne({
      where: { id: requestId, isDeleted: false },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === to) return request;

    if (!REQUEST_STATUS_TRANSITIONS[request.status].includes(to)) {
      throw new ConflictException(
        `A request ${request.status} cannot become ${to}.`,
      );
    }

    const from = request.status;
    request.status = to;
    request.updatedBy = options.actorId ?? request.updatedBy;
    const saved = await repo.save(request);
    await recordRequestActivity(manager, {
      requestId,
      action: 'status_changed',
      actorId: options.actorId,
      fromStatus: from,
      toStatus: to,
      note: options.note,
    });
    return saved;
  }
}

import { SalesRequestActivity } from '@plugins/sales/request/entities/request-activity.entity';

import type { EntityManager } from 'typeorm';

export interface RequestActivityInput {
  requestId: number;
  action: string;
  actorId?: number | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}

/**
 * Appends one line to the request's timeline on the caller's manager, so the line commits or
 * rolls back with the change it describes.
 */
export async function recordRequestActivity(
  manager: EntityManager,
  input: RequestActivityInput,
): Promise<void> {
  const repo = manager.getRepository(SalesRequestActivity);
  await repo.save(
    repo.create({
      requestId: input.requestId,
      action: input.action,
      actorId: input.actorId ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
    }),
  );
}

import { Injectable } from '@nestjs/common';

import type { EntityManager } from 'typeorm';

/** Why and by whom the request is being closed from its own page. */
export interface RequestClose {
  requestId: number;
  reason: string;
  actorId: number;
}

/**
 * Runs inside the transaction that cancels or loses a request, on its manager: whatever a
 * document writes through it commits or rolls back with the close. Throwing (a 409) keeps the
 * request open.
 */
export type RequestCloseHandler = (
  manager: EntityManager,
  close: RequestClose,
) => Promise<void>;

/**
 * Lets the documents that hang off a request (the quotation, later the order) close with it in
 * the same transaction, without the request feature importing them: each registers one handler
 * at start-up and the request's close calls them all. Synchronous on purpose, like the
 * customer owner-change hook — a request closed while its quotation stays open would leave a
 * document nobody can finish.
 *
 * Lock order, the one every sales write follows: estimate → request → quotation header. The
 * request close holds the request row before it calls a handler, so a handler may lock the
 * document header but a document write must never take a header and then lock a request.
 */
@Injectable()
export class RequestCloseRegistry {
  private readonly handlers = new Map<string, RequestCloseHandler>();

  /** `name` identifies the registering document kind; a second handler under it is a bug. */
  register(name: string, handler: RequestCloseHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Request close handler "${name}" is already registered`);
    }
    this.handlers.set(name, handler);
  }

  /** Runs every handler in registration order; the first failure aborts the caller's transaction. */
  async apply(manager: EntityManager, close: RequestClose): Promise<void> {
    for (const handler of this.handlers.values()) {
      await handler(manager, close);
    }
  }
}

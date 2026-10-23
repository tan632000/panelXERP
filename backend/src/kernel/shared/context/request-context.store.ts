import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  requestId?: string;
  traceId?: string;
  ip?: string;
  userId?: string | number;
  username?: string;
  /** Role code and permissions of the signed-in actor, for record-level scope checks. */
  role?: string;
  permissions?: string[];
}

export class RequestContextStore {
  private static readonly storage = new AsyncLocalStorage<RequestContextData>();

  static run<T>(context: RequestContextData, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  static get(): RequestContextData {
    return this.storage.getStore() || {};
  }

  static patch(partial: Partial<RequestContextData>): void {
    const store = this.storage.getStore();
    if (!store) {
      return;
    }
    Object.assign(store, partial);
  }
}

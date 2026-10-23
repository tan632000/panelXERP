/**
 * Domain event base interface.
 * Plugins can emit/listen events through EventEmitter2.
 */
export interface DomainEvent {
  name: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * EventsModule — internal event bus using @nestjs/event-emitter.
 * Plugins can emit/listen events through EventEmitter2.
 * e.g. Sales emits 'sales.order.created', Planning listens to create MRP.
 *
 * Import EVENT_SCHEMAS / validateEventPayload from
 * `@kernel/platform/events/event-schemas` (do not re-export here).
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  exports: [EventEmitterModule],
})
export class EventsModule {}

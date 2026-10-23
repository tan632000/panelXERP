/**
 * Event schema registry — single source of truth for event payload shapes.
 *
 * Every event emitted through the bus MUST have an entry here.
 * Schemas serve as:
 *   1. Type-checking at emit time (no invalid payloads)
 *   2. Documentation for cross-plugin consumers
 *   3. Validation target for AI-generated extensions
 *
 * Usage:
 *   import { EVENT_SCHEMAS, validateEventPayload } from '@shared/events/event-schemas';
 *
 *   // Type-safe emit
 *   const payload = { rfqId: 123, rfqCode: 'RFQ-001', customerId: 456 };
 *   validateEventPayload('sales.rfq.created', payload);
 *   this.eventEmitter.emit('sales.rfq.created', payload);
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface EventFieldSchema {
  type: FieldType;
  required?: boolean;
  description?: string;
  nullable?: boolean;
}

export type EventSchema = Record<string, EventFieldSchema>;

// ─── Event schema registry — add new events here ──────────────────────

export const EVENT_SCHEMAS = {
  'sales.rfq.created': {
    rfqId: { type: 'number', required: true, description: 'RFQ internal ID' },
    rfqCode: {
      type: 'string',
      required: true,
      description: 'RFQ code (human-readable)',
    },
    customerId: { type: 'number', required: false, nullable: true },
    productName: { type: 'string', required: false, nullable: true },
    status: { type: 'string', required: false, nullable: true },
  } satisfies Record<string, EventFieldSchema>,
  'qc-lab.oqc-sample-recorded': {
    refType: {
      type: 'string',
      required: true,
      description: 'sampleOrder | toolingOrder',
    },
    refId: {
      type: 'number',
      required: true,
      description: 'Inspected document internal ID',
    },
    result: { type: 'string', required: true, description: 'pass | fail' },
  } satisfies Record<string, EventFieldSchema>,
  'qc-lab.oqc-sample-reverted': {
    refType: {
      type: 'string',
      required: true,
      description: 'sampleOrder | toolingOrder',
    },
    refId: {
      type: 'number',
      required: true,
      description: 'Inspected document internal ID',
    },
  } satisfies Record<string, EventFieldSchema>,
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;

/**
 * Given an event name, resolve the expected payload type.
 *
 * Uses `extends` pattern-matching instead of indexed access
 * to work correctly with `as const` deeply-readonly objects.
 */
type SchemaFieldValue<
  N extends EventName,
  K extends keyof (typeof EVENT_SCHEMAS)[N],
> = (typeof EVENT_SCHEMAS)[N][K];

type FieldToTsType<T> = T extends { type: 'number' }
  ? number
  : T extends { type: 'string' }
    ? string
    : T extends { type: 'boolean' }
      ? boolean
      : T extends { type: 'array' }
        ? unknown[]
        : Record<string, unknown>;

export type EventPayload<N extends EventName> = {
  [
    K in keyof (typeof EVENT_SCHEMAS)[N] as SchemaFieldValue<N, K> extends {
      required: true;
    }
      ? K
      : never
  ]: FieldToTsType<SchemaFieldValue<N, K>>;
} & {
  [
    K in keyof (typeof EVENT_SCHEMAS)[N] as SchemaFieldValue<N, K> extends {
      required?: false;
    }
      ? K
      : never
  ]?: FieldToTsType<SchemaFieldValue<N, K>>;
};

export class EventValidationError extends Error {
  constructor(
    public readonly eventName: string,
    public readonly errors: string[],
  ) {
    super(`Event "${eventName}" validation failed: ${errors.join('; ')}`);
    this.name = 'EventValidationError';
  }
}

/**
 * Validate a payload against the registered schema for `eventName`.
 * Throws EventValidationError on mismatch.
 *
 * In production, this is a no-op if NODE_ENV=production (for perf).
 */
export function validateEventPayload(
  eventName: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'production') return;

  const schema = (
    EVENT_SCHEMAS as Record<string, Record<string, EventFieldSchema>>
  )[eventName];
  if (!schema) {
    throw new EventValidationError(eventName, [
      `No schema registered for event "${eventName}". Add it to event-schemas.ts`,
    ]);
  }

  const errors: string[] = [];

  for (const [field, fieldSchema] of Object.entries(schema)) {
    const value = payload[field];

    if (fieldSchema.required && (value === undefined || value === null)) {
      errors.push(`Missing required field "${field}"`);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (fieldSchema.nullable && value === null) {
      continue;
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== fieldSchema.type) {
      errors.push(
        `Field "${field}": expected ${fieldSchema.type}, got ${actualType} (${JSON.stringify(value)})`,
      );
    }
  }

  if (errors.length > 0) {
    throw new EventValidationError(eventName, errors);
  }
}

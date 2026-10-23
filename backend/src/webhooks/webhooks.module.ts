import { Module } from '@nestjs/common';

/**
 * Endpoints called by external partner systems (second parties), kept apart from the ERP's own
 * user-facing API. Each partner lives in its own folder, authenticates with its own credential
 * instead of a user JWT, and is served under `/api/v1/webhooks/<partner>/…`.
 */
@Module({
  imports: [],
})
export class WebhooksModule {}

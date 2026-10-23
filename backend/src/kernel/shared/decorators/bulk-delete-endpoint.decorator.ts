import { applyDecorators, Post, type Type } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RequirePermission } from '@kernel/core/auth/decorators/auth.decorators';

import { BulkDeleteDto } from '@shared/dto/bulk-delete.dto';

export interface BulkDeleteEndpointOptions {
  /**
   * Permission the single-row delete requires; a batch grants nothing extra. Several mean any
   * one of them opens the route.
   */
  permission: string | readonly string[];
  /** Names the rows in the API docs, e.g. `companies`. */
  subject: string;
  /** Route under the controller prefix. Defaults to `bulk-delete`. */
  route?: string;
  /**
   * Body shape, when the ids are not numeric. Defaults to `BulkDeleteDto`; a resource keyed
   * by a business code passes `BulkDeleteCodesDto` so the documented type matches what the
   * validator accepts.
   */
  bodyType?: Type<unknown>;
}

/**
 * Declares the bulk-delete endpoint of a list: the rows ticked in its table, soft-deleted
 * through the same per-row guards, reported one outcome per id.
 *
 * It is a POST rather than a DELETE because the ids travel in a body, which a DELETE is not
 * guaranteed to carry through proxies and clients.
 */
export function BulkDeleteEndpoint({
  permission,
  subject,
  route = 'bulk-delete',
  bodyType = BulkDeleteDto,
}: BulkDeleteEndpointOptions) {
  return applyDecorators(
    Post(route),
    RequirePermission(...[permission].flat()),
    ApiOperation({
      summary: `Soft-delete selected ${subject}`,
      description:
        'Soft-deletes the given ids through the same guards as the single-row delete, one at a time. A row a guard refuses is reported in `failed` and leaves the rest of the batch deleted.',
    }),
    ApiBody({ type: bodyType }),
    ApiResponse({
      status: 201,
      description:
        'Per-id outcome: `{ deleted: number[], failed: [{ id, message }] }`',
    }),
    ApiResponse({ status: 400, description: 'Empty or invalid id list' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({
      status: 403,
      description: `Forbidden — requires ${[permission].flat().join(' or ')}`,
    }),
  );
}

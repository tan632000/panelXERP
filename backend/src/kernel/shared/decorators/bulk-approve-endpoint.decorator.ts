import { applyDecorators, Post, type Type } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { RequirePermission } from '@kernel/core/auth/decorators/auth.decorators';

import { BulkApproveDto } from '@shared/dto/bulk-approve.dto';

export interface BulkApproveEndpointOptions {
  /**
   * Permission the single-row approval requires; a batch grants nothing extra. Several mean
   * any one of them opens the route.
   */
  permission: string | readonly string[];
  /** Names the rows in the API docs, e.g. `purchase requests`. */
  subject: string;
  /** Route under the controller prefix. Defaults to `bulk-approve`. */
  route?: string;
  /** Body shape, when the ids are not numeric. Defaults to `BulkApproveDto`. */
  bodyType?: Type<unknown>;
}

/**
 * Declares the bulk-approve endpoint of a list: the rows ticked in its table, approved one at
 * a time through the single-row approval, reported one outcome per id.
 */
export function BulkApproveEndpoint({
  permission,
  subject,
  route = 'bulk-approve',
  bodyType = BulkApproveDto,
}: BulkApproveEndpointOptions) {
  return applyDecorators(
    Post(route),
    RequirePermission(...[permission].flat()),
    ApiOperation({
      summary: `Approve selected ${subject}`,
      description:
        'Approves the given ids through the same rules as the single-row approval, one at a time. A row that approval refuses is reported in `failed` and leaves the rest of the batch approved.',
    }),
    ApiBody({ type: bodyType }),
    ApiResponse({
      status: 201,
      description:
        'Per-id outcome: `{ approved: number[], failed: [{ id, message }] }`',
    }),
    ApiResponse({ status: 400, description: 'Empty or invalid id list' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({
      status: 403,
      description: `Forbidden — requires ${[permission].flat().join(' or ')}`,
    }),
  );
}

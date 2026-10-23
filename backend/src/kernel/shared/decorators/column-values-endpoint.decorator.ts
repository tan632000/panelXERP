import { applyDecorators, Get } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { RequirePermission } from '@kernel/core/auth/decorators/auth.decorators';

export interface ColumnValuesEndpointOptions {
  /** Permission the list itself requires; the values expose no more than its rows. */
  permission: string;
  /** Filterable column keys, listed in the API docs. */
  columns: readonly string[];
  /** Route under the controller prefix. Defaults to `column-values`. */
  route?: string;
  /** Names the list in the summary, e.g. `contact`. */
  subject?: string;
}

/**
 * Declares the column-values endpoint of a list: the distinct values one filterable column
 * holds, paginated and searchable, for the column filter of its table.
 *
 * Every list documents and guards this endpoint the same way, so a plugin adding a list
 * writes one decorator plus its service's `ColumnFilterMap`.
 */
export function ColumnValuesEndpoint({
  permission,
  columns,
  route = 'column-values',
  subject,
}: ColumnValuesEndpointOptions) {
  const of = subject
    ? ` of one filterable ${subject} column`
    : ' of one filterable column';

  return applyDecorators(
    Get(route),
    RequirePermission(permission),
    ApiOperation({
      summary: `List distinct values${of}`,
      description:
        'Paginated, searchable distinct values of a filterable list column, for the column filter of the list table. Values come from the whole table, not one page.',
    }),
    ApiQuery({
      name: 'column',
      required: true,
      type: String,
      description: `Column key: ${columns.join(', ')}`,
    }),
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Search within the values',
    }),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'limit', required: false, type: Number }),
    ApiResponse({
      status: 200,
      description: 'Paginated distinct column values',
    }),
    ApiResponse({ status: 400, description: 'Column is not filterable' }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({
      status: 403,
      description: `Forbidden — requires ${permission}`,
    }),
  );
}

import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export function applyOptionalEq<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  param: string,
  value: unknown,
): void {
  if (value !== undefined && value !== null && value !== '') {
    qb.andWhere(`${column} = :${param}`, { [param]: value });
  }
}

export function applyDateRange<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  dateFrom?: string,
  dateTo?: string,
): void {
  if (dateFrom) {
    qb.andWhere(`${column} >= :dateFrom`, { dateFrom });
  }
  if (dateTo) {
    qb.andWhere(`${column} <= :dateTo`, { dateTo });
  }
}

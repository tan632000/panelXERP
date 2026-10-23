import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { previewYearScopedCode } from '@shared/utils/max-based-code.util';

import type { DataSource } from 'typeorm';

export interface DocumentCodeConfig {
  /** Physical table holding the documents, e.g. `rfqs`. */
  table: string;
  /** Column holding the code, e.g. `rfq_code`. */
  column: string;
  /** Prefix without separator, e.g. `R`. */
  prefix: string;
}

/**
 * Year-scoped document codes — `R_2026_0049`: prefix, current year, ordinal.
 *
 * The ordinal comes from the documents themselves, so there is no sequence table to
 * keep in sync and every year restarts at `0001` on its own. Deleted documents keep
 * their number reserved: a business document number is never handed to a second
 * document, which leaves gaps rather than duplicates.
 */
@Injectable()
export class DocumentCodeService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async generateCode(
    config: DocumentCodeConfig,
    year = new Date().getFullYear(),
  ): Promise<string> {
    return previewYearScopedCode(this.dataSource, {
      table: config.table,
      column: config.column,
      prefix: config.prefix,
      year,
    });
  }
}

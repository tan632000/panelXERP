import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsObject,
} from 'class-validator';

import type { ExcelImportDocument } from '@shared/utils/excel-import.util';

/**
 * Ceiling on documents per import. The whole file is judged and written in one transaction,
 * one savepoint per document, so an unbounded request would hold that transaction open for as
 * long as it likes. The client parser refuses a larger file before uploading it.
 */
export const EXCEL_IMPORT_MAX_DOCUMENTS = 500;

/**
 * The documents an uploaded sheet was grouped into, each carrying the sheet rows it came from.
 *
 * Deliberately shape-only: each document is validated by `runExcelImport` against the feature's
 * own create/update DTO, because only that layer can blame the file row a broken rule belongs
 * to. Validating the documents here would answer with one row-less error for the whole file.
 */
export class ExcelImportRequestDto {
  @ApiProperty({
    description: `Documents to create or update (1–${EXCEL_IMPORT_MAX_DOCUMENTS}). Each is the feature's create payload plus \`fileRow\`, an optional \`code\` (an existing active code updates that record), and a \`fileRow\` on every line.`,
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(EXCEL_IMPORT_MAX_DOCUMENTS)
  @IsObject({ each: true })
  documents!: ExcelImportDocument[];
}

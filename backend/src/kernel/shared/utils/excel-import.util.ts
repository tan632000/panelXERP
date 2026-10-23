import { BadRequestException, HttpException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import type { DataSource, EntityManager } from 'typeorm';

/** One problem with one imported document, located by the sheet row the reader sees. */
export interface ExcelImportRowError {
  /** 1-based sheet row: the document's first row, or the line's own row. */
  fileRow: number;
  /**
   * The payload field that broke a rule — `date`, or `lines.qtyPcs` for a line field — so the
   * client can name the column. Absent when the rule is about the document as a whole.
   */
  field?: string;
  /**
   * `duplicateCode`, `codeNotFound`, a class-validator constraint name (`isInt`, `min`, ...),
   * or `rejected` for a rule the service itself enforces.
   */
  code: string;
  /** The rule's own (English) wording; the client shows a translated message where it has one. */
  message?: string;
}

export interface ExcelImportResult {
  created: number;
  updated: number;
}

/** A document of an import request: a create/update payload plus the rows it came from. */
export type ExcelImportDocument = Record<string, unknown> & {
  fileRow: number;
  code?: string;
};

/**
 * What one feature plugs into `runExcelImport`. `create`/`update` must run every write on the
 * manager they are handed — the import's own transaction — and allocate codes through it too,
 * or two documents created in one file would be handed the same code.
 */
export interface ExcelImportHandler<
  TCreate extends object,
  TUpdate extends object,
> {
  createDto: ClassConstructor<TCreate>;
  updateDto: ClassConstructor<TUpdate>;
  /** Array fields whose items carry their own `fileRow`, e.g. `['lines']`. */
  lineFields: readonly string[];
  /**
   * Whether the create payload carries the code. When the server always allocates it, a code
   * the file names but no active record holds cannot be created, so it is a row error.
   */
  createTakesCode: boolean;
  /**
   * For a create payload that requires its code (the form fills it from the next-code
   * preview), the code a blank-code document is created under, allocated on `manager` so two
   * documents of one file are never handed the same one. Only read when `createTakesCode`.
   */
  allocateCode?: (manager: EntityManager) => Promise<string>;
  /** Id of the active record holding `code` (case-insensitive), read on `manager`. */
  findIdByCode(
    code: string,
    manager: EntityManager,
  ): Promise<number | undefined>;
  create(dto: TCreate, manager: EntityManager): Promise<unknown>;
  update(id: number, dto: TUpdate, manager: EntityManager): Promise<unknown>;
}

/** Thrown inside the transaction to roll it back once every document has been judged. */
class ImportRejected extends Error {}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function lineRows(
  document: ExcelImportDocument,
  lineFields: readonly string[],
): unknown[] {
  return lineFields.flatMap((field) => {
    const lines = document[field];
    return Array.isArray(lines) ? (lines as unknown[]) : [];
  });
}

/** Every document and every line must say which sheet row it came from, or no error could. */
function assertRowsAddressed(
  documents: readonly ExcelImportDocument[],
  lineFields: readonly string[],
): void {
  const addressed = documents.every(
    (document) =>
      isPositiveInteger(document.fileRow) &&
      lineRows(document, lineFields).every(
        (line) =>
          typeof line === 'object' &&
          line !== null &&
          isPositiveInteger((line as { fileRow?: unknown }).fileRow),
      ),
  );
  if (!addressed) {
    throw new BadRequestException(
      'Every imported document and line must carry a positive integer fileRow.',
    );
  }
}

/** The payload a DTO validates: the document minus the bookkeeping the file adds. */
function toPayload(
  document: ExcelImportDocument,
  lineFields: readonly string[],
  keepCode: boolean,
): Record<string, unknown> {
  const { fileRow: _fileRow, code, ...rest } = document;
  const payload: Record<string, unknown> = { ...rest };
  if (keepCode && typeof code === 'string' && code.trim()) {
    payload.code = code.trim();
  }
  for (const field of lineFields) {
    const lines = payload[field];
    if (!Array.isArray(lines)) continue;
    payload[field] = lines.map((line: unknown) => {
      if (typeof line !== 'object' || line === null) return line;
      const { fileRow: _lineRow, ...lineRest } = line as Record<
        string,
        unknown
      >;
      return lineRest;
    });
  }
  return payload;
}

function firstConstraint(
  error: ValidationError,
): { code: string; message: string } | undefined {
  const [entry] = Object.entries(error.constraints ?? {});
  return entry ? { code: entry[0], message: entry[1] } : undefined;
}

/**
 * Flattens class-validator's tree into row errors: a header field is blamed on the document's
 * first row, a line field on the line's own row — the row the reader has to fix.
 */
function toRowErrors(
  errors: readonly ValidationError[],
  document: ExcelImportDocument,
  lineFields: readonly string[],
): ExcelImportRowError[] {
  const rowErrors: ExcelImportRowError[] = [];
  for (const error of errors) {
    const own = firstConstraint(error);
    if (own) {
      rowErrors.push({
        fileRow: document.fileRow,
        field: error.property,
        ...own,
      });
    }
    if (!error.children?.length) continue;

    if (!lineFields.includes(error.property)) {
      // A nested payload the file does not address row by row (e.g. lines folded into one
      // cell): blamed on the document's row, but never dropped — a document rejected with no
      // error would otherwise be skipped silently while the rest of the file commits.
      const nested = firstNestedConstraint(error.children);
      if (nested) {
        rowErrors.push({
          fileRow: document.fileRow,
          field: `${error.property}.${nested.property}`,
          code: nested.code,
          message: nested.message,
        });
      }
      continue;
    }

    const lines = document[error.property] as Array<{ fileRow: number }>;
    for (const lineError of error.children) {
      const line = lines[Number(lineError.property)];
      for (const fieldError of lineError.children ?? []) {
        const constraint = firstConstraint(fieldError);
        if (!constraint) continue;
        rowErrors.push({
          fileRow: line?.fileRow ?? document.fileRow,
          field: `${error.property}.${fieldError.property}`,
          ...constraint,
        });
      }
    }
  }
  return rowErrors;
}

/** The first leaf constraint below a nested error, with the leaf's own property name. */
function firstNestedConstraint(
  errors: readonly ValidationError[],
): { property: string; code: string; message: string } | undefined {
  for (const error of errors) {
    const own = firstConstraint(error);
    if (own) return { property: error.property, ...own };
    const deeper = firstNestedConstraint(error.children ?? []);
    if (deeper) return deeper;
  }
  return undefined;
}

/** The row errors of a failed validation — never none, so a rejected document always rolls back. */
function rowErrorsOrFallback(
  invalid: readonly ValidationError[],
  document: ExcelImportDocument,
  handler: { lineFields: readonly string[] },
): ExcelImportRowError[] {
  const rowErrors = toRowErrors(invalid, document, handler.lineFields);
  return rowErrors.length > 0
    ? rowErrors
    : [{ fileRow: document.fileRow, code: 'invalidValue' }];
}

/** The message a service rule threw, whichever envelope Nest wrapped it in. */
function exceptionMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join(' ');
  return typeof message === 'string' ? message : error.message;
}

/**
 * Imports a whole file as one all-or-nothing upsert.
 *
 * Every document is judged exactly as its own create or update request would be — the same
 * DTO, then the same service method with its business rules — so an import can never write
 * what the form could not. A document whose code names an active record updates it; any other
 * document is created. Each runs in a savepoint of one transaction, so a rejected document
 * leaves nothing behind while the rest are still judged, and the reader gets every row's
 * problem in one answer. Any error rolls the whole file back.
 */
export async function runExcelImport<
  TCreate extends object,
  TUpdate extends object,
>(
  dataSource: DataSource,
  documents: readonly ExcelImportDocument[],
  handler: ExcelImportHandler<TCreate, TUpdate>,
): Promise<ExcelImportResult> {
  assertRowsAddressed(documents, handler.lineFields);

  const errors: ExcelImportRowError[] = [];
  const firstRowByCode = new Map<string, number>();
  for (const document of documents) {
    const code = typeof document.code === 'string' ? document.code.trim() : '';
    if (!code) continue;
    const key = code.toLocaleLowerCase();
    if (firstRowByCode.has(key)) {
      errors.push({
        fileRow: document.fileRow,
        field: 'code',
        code: 'duplicateCode',
        message: `Code ${code} appears more than once in the file.`,
      });
    } else {
      firstRowByCode.set(key, document.fileRow);
    }
  }
  if (errors.length > 0) {
    throw new BadRequestException({ message: 'Import rejected.', errors });
  }

  try {
    return await dataSource.transaction(async (manager) => {
      const result: ExcelImportResult = { created: 0, updated: 0 };
      for (const document of documents) {
        const code =
          typeof document.code === 'string' ? document.code.trim() : '';
        const existingId = code
          ? await handler.findIdByCode(code, manager)
          : undefined;
        if (code && existingId === undefined && !handler.createTakesCode) {
          errors.push({
            fileRow: document.fileRow,
            field: 'code',
            code: 'codeNotFound',
            message: `No active record has code ${code}.`,
          });
          continue;
        }

        // Both paths are judged by the create DTO — the form's own rules, every required
        // field present — because an update DTO leaves every field optional and would let a
        // blank required cell through as "unchanged".
        const isUpdate = existingId !== undefined;
        const createPayload = toPayload(
          document,
          handler.lineFields,
          handler.createTakesCode,
        );
        if (
          !isUpdate &&
          !code &&
          handler.createTakesCode &&
          handler.allocateCode
        ) {
          createPayload.code = await handler.allocateCode(manager);
        }
        const createDto = plainToInstance(handler.createDto, createPayload);
        const invalid = await validate(createDto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        });
        if (invalid.length > 0) {
          errors.push(...toRowErrors(invalid, document, handler.lineFields));
          continue;
        }
        // An update takes the fields its own DTO accepts; the rest (the code, fields fixed at
        // creation) are dropped rather than failing, so an exported file re-imports unchanged.
        let updateDto: TUpdate | undefined;
        if (isUpdate) {
          updateDto = plainToInstance(
            handler.updateDto,
            toPayload(document, handler.lineFields, false),
          );
          const invalidUpdate = await validate(updateDto, { whitelist: true });
          if (invalidUpdate.length > 0) {
            errors.push(
              ...rowErrorsOrFallback(invalidUpdate, document, handler),
            );
            continue;
          }
        }

        try {
          await manager.transaction((savepoint) =>
            updateDto !== undefined && existingId !== undefined
              ? handler.update(existingId, updateDto, savepoint)
              : handler.create(createDto, savepoint),
          );
        } catch (error: unknown) {
          // A rule the service enforces is this row's problem; anything else is a real fault.
          if (!(error instanceof HttpException) || error.getStatus() >= 500) {
            throw error;
          }
          errors.push({
            fileRow: document.fileRow,
            code: 'rejected',
            message: exceptionMessage(error),
          });
          continue;
        }
        if (isUpdate) result.updated += 1;
        else result.created += 1;
      }

      if (errors.length > 0) throw new ImportRejected();
      return result;
    });
  } catch (error: unknown) {
    if (!(error instanceof ImportRejected)) throw error;
    throw new BadRequestException({
      message: 'Import rejected.',
      errors: [...errors].sort((left, right) => left.fileRow - right.fileRow),
    });
  }
}

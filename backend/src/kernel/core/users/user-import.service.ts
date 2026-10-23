import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ImportUserDto } from '@kernel/core/users/dto/import-user.dto';
import { UpdateUserDto } from '@kernel/core/users/dto/update-user.dto';
import { UsersService } from '@kernel/core/users/users.service';

import {
  isPostgresUniqueViolation,
  uniqueViolationConflict,
} from '@shared/utils/db-error.util';
import {
  runExcelImport,
  type ExcelImportDocument,
  type ExcelImportResult,
} from '@shared/utils/excel-import.util';

/**
 * The messages the create path words its own conflicts in. The client maps them to localized
 * text, so they are a contract: change them together with the frontend's import modal.
 */
const USERNAME_TAKEN = 'Username is already in use';
const EMAIL_TAKEN = 'Email is already in use';

/**
 * Excel import of accounts (function list 1.9), one sheet row per account. The file is judged
 * by the kernel import runner — all or nothing, every row's problem reported at once, one
 * transaction — and each row goes through the same create the form calls, so an import cannot
 * store what the form would refuse. An import only creates: there is no account code to
 * update by, and a username or email already in use is a row error.
 *
 * No password is read from the file: the accounts are made with an unusable one and their
 * owners set their own through the reset flow, exactly as the CSV import did. Nothing here
 * sends mail, so there is no notification to hold back until the commit.
 */
@Injectable()
export class UserImportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
  ) {}

  import(
    documents: readonly ExcelImportDocument[],
    actorId: number,
  ): Promise<ExcelImportResult> {
    return runExcelImport(this.dataSource, documents, {
      createDto: ImportUserDto,
      updateDto: UpdateUserDto,
      lineFields: [],
      createTakesCode: false,
      // Accounts carry no document code, so no row ever names an existing one.
      findIdByCode: () => Promise.resolve(undefined),
      create: async (dto, manager) => {
        try {
          // Earlier rows of the file are already written on this transaction, so a username
          // or email the file repeats is caught by the same check as one already stored.
          await this.users.createRecord(dto, actorId, manager);
        } catch (error: unknown) {
          // The identity indexes ignore case, which the pre-insert check does not: a lost
          // race or a differently-cased twin lands here as a row error, never a 500.
          if (!isPostgresUniqueViolation(error)) throw error;
          throw (
            uniqueViolationConflict(error, [
              { matches: ['username'], message: USERNAME_TAKEN },
              { matches: ['email'], message: EMAIL_TAKEN },
            ]) ?? new ConflictException(USERNAME_TAKEN)
          );
        }
      },
      update: () => {
        throw new BadRequestException('An import only creates accounts.');
      },
    });
  }
}

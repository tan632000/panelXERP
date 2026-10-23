import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
} from '@kernel/core/auth/dto/reset-password.dto';
import {
  USER_DEPARTMENTS,
  USER_DEPARTMENT_INVALID_MESSAGE,
  type UserDepartment,
} from '@kernel/core/users/constants/user-department.constant';

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const USERNAME_RULE_MESSAGE =
  'Username may contain letters, digits, dot, underscore and hyphen only';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CreateUserDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(USERNAME_PATTERN, { message: USERNAME_RULE_MESSAGE })
  username: string;

  @ApiProperty({ maxLength: 255 })
  @Transform(trimLower)
  @IsEmail({}, { message: 'Email format is invalid' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ description: 'Role code the account is assigned to' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  roleCode: string;

  /**
   * Omitted means the account is created without a usable password and the holder receives a
   * reset link instead, so no one but they ever knows it.
   */
  @ApiPropertyOptional({
    description: PASSWORD_RULE_MESSAGE,
    minLength: PASSWORD_MIN_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_RULE_MESSAGE })
  password?: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({ enum: USER_DEPARTMENTS, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(USER_DEPARTMENTS, { message: USER_DEPARTMENT_INVALID_MESSAGE })
  department?: UserDepartment | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(100)
  title?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

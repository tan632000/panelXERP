import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  USER_DEPARTMENTS,
  USER_DEPARTMENT_INVALID_MESSAGE,
  type UserDepartment,
} from '@kernel/core/users/constants/user-department.constant';

/** An emptied optional field is stored as NULL, not as an empty string. */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateProfileDto {
  /** Anyone may rename their own username; the value must still be free. */
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Username may contain letters, digits, dot, underscore and hyphen only',
  })
  username?: string;

  /**
   * Anyone may change their own email; a different address needs `currentPassword`, since the
   * email is where a password reset link lands.
   */
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email format is invalid' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'The password currently in use; required to change the email',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional({ maxLength: 20, nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+().\-\s]+$/, { message: 'Phone number format is invalid' })
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
}

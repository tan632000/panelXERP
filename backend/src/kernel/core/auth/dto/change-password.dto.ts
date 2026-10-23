import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
} from '@kernel/core/auth/dto/reset-password.dto';

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password currently in use' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: PASSWORD_RULE_MESSAGE,
    minLength: PASSWORD_MIN_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_RULE_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_RULE_MESSAGE })
  newPassword: string;
}

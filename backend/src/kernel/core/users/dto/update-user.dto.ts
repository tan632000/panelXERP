import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';

import { CreateUserDto } from '@kernel/core/users/dto/create-user.dto';

/**
 * Every field is optional; the password is not among them — an administrator sets one through
 * `POST /users/:id/reset-password`, which also drops the sessions the account is holding.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional({ description: 'Role code the account is assigned to' })
  declare roleCode?: string;
}

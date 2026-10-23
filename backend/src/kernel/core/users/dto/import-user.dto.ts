import { OmitType } from '@nestjs/swagger';

import { CreateUserDto } from '@kernel/core/users/dto/create-user.dto';

/**
 * The account an Excel row may describe: the create form's rules without the two fields the
 * sheet never carries. A password is never read from a file — an imported account holds an
 * unusable one until its owner sets their own — and every imported account starts active.
 * The import validates with `forbidNonWhitelisted`, so a crafted payload naming either is
 * rejected rather than silently honoured.
 */
export class ImportUserDto extends OmitType(CreateUserDto, [
  'password',
  'isActive',
] as const) {}

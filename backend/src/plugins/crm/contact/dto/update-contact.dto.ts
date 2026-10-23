import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateContactDto } from '@plugins/crm/contact/dto/create-contact.dto';

/** A contact never moves to another customer, so `customerId` is not updatable. */
export class UpdateContactDto extends PartialType(
  OmitType(CreateContactDto, ['customerId'] as const),
) {}

import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateRequestDto } from '@plugins/sales/request/dto/create-request.dto';

/** A request never moves to another customer, so `customerId` is not updatable. */
export class UpdateRequestDto extends PartialType(
  OmitType(CreateRequestDto, ['customerId'] as const),
) {}

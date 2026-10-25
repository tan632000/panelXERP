import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateOrderDto } from '@plugins/sales/order/dto/create-order.dto';

/**
 * Contract number, contract date and delivery date, while the order is open. Lines, prices,
 * totals and snapshots are never editable, so none of their fields exists here.
 */
export class UpdateOrderDto extends PartialType(
  OmitType(CreateOrderDto, ['quotationId'] as const),
) {}

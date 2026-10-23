import { PartialType } from '@nestjs/swagger';

import { CreateCustomerDto } from '@plugins/crm/customer/dto/create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

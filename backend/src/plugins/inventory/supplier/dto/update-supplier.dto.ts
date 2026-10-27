import { PartialType } from '@nestjs/swagger';

import { CreateSupplierDto } from '@plugins/inventory/supplier/dto/create-supplier.dto';

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

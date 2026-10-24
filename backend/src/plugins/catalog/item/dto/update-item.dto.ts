import { PartialType } from '@nestjs/swagger';

import { CreateItemDto } from '@plugins/catalog/item/dto/create-item.dto';

/** The code is immutable: the service accepts only a value equal to the stored one. */
export class UpdateItemDto extends PartialType(CreateItemDto) {}

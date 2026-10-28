import { PartialType } from '@nestjs/swagger';

import { CreateLocationDto } from '@plugins/catalog/location/dto/create-location.dto';

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}

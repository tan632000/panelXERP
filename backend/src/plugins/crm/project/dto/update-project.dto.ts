import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateProjectDto } from '@plugins/crm/project/dto/create-project.dto';

/** A project never moves to another customer, so `customerId` is not updatable. */
export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, ['customerId'] as const),
) {}

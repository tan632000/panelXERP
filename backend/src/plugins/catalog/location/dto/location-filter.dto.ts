import { ColumnValuesQueryFor } from '@shared/dto/column-filter.dto';
import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class LocationFilterDto extends SortableListFilterQueryDto {}

/** Column values of the list, scoped to the rows its toolbar leaves. */
export class LocationColumnValuesQueryDto extends ColumnValuesQueryFor(
  LocationFilterDto,
) {}

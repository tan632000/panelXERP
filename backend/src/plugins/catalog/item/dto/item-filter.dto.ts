import { ColumnValuesQueryFor } from '@shared/dto/column-filter.dto';
import { SortableListFilterQueryDto } from '@shared/dto/list-filter.dto';

export class ItemFilterDto extends SortableListFilterQueryDto {}

/** Column values of the list, scoped to the rows its toolbar leaves. */
export class ItemColumnValuesQueryDto extends ColumnValuesQueryFor(
  ItemFilterDto,
) {}

import {
  numberFormField,
  optionalTrimmedField,
  trimFormField,
} from "@/kernel/core/lib/form-payload";

import type { ItemGroup } from "@plugins/catalog/item/constants";
import type {
  ItemFormInput,
  ItemFormValues,
} from "@plugins/catalog/item/schemas/item.schema";
import type {
  CreateItemDto,
  Item,
  UpdateItemDto,
} from "@plugins/catalog/item/types";

export const EMPTY_ITEM_FORM = {
  code: "",
  name: "",
  specification: "",
  brand: "",
  group: "",
  unit: "",
  referencePrice: "",
  note: "",
} satisfies ItemFormInput;

export function toItemFormValues(item: Item): ItemFormInput {
  return {
    code: item.code,
    name: item.name ?? "",
    specification: item.specification ?? "",
    brand: item.brand ?? "",
    group: item.group,
    unit: item.unit,
    referencePrice: String(numberFormField(item.referencePrice)),
    note: item.note ?? "",
  };
}

/** An empty field (no price entered) is `undefined`; a validated string becomes a number. */
function priceOf(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

/** Create omits the empty optional fields. */
export function toItemCreatePayload(data: ItemFormValues): CreateItemDto {
  return {
    code: data.code.trim(),
    name: data.name.trim(),
    specification: optionalTrimmedField(data.specification),
    brand: optionalTrimmedField(data.brand),
    group: data.group as ItemGroup,
    unit: data.unit.trim(),
    referencePrice: priceOf(data.referencePrice),
    note: optionalTrimmedField(data.note),
  };
}

/** Full-form update: clearable fields are always sent so a cleared one persists; the code is fixed. */
export function toItemUpdatePayload(data: ItemFormValues): UpdateItemDto {
  return {
    name: data.name.trim(),
    specification: trimFormField(data.specification),
    brand: trimFormField(data.brand),
    group: data.group as ItemGroup,
    unit: data.unit.trim(),
    referencePrice: priceOf(data.referencePrice) ?? null,
    note: trimFormField(data.note),
  };
}

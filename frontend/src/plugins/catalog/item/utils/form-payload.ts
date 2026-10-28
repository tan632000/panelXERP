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
  UpdateItemStockSettingsDto,
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
  barcode: "",
  defaultLocationId: "",
  minStock: "",
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
    barcode: item.barcode ?? "",
    defaultLocationId:
      item.defaultLocationId == null ? "" : String(item.defaultLocationId),
    minStock: String(numberFormField(item.minStock)),
  };
}

/** An empty field (nothing entered) is `undefined`; a validated string becomes a number. */
function numberOf(value: string): number | undefined {
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
    referencePrice: numberOf(data.referencePrice),
    note: optionalTrimmedField(data.note),
  };
}

/**
 * Full-form update: clearable fields are always sent so a cleared one persists; the code is
 * fixed. Without `includeReferencePrice` (the actor cannot see the price) the field is left
 * out, so saving never wipes a price the form never showed.
 */
export function toItemUpdatePayload(
  data: ItemFormValues,
  { includeReferencePrice = true }: { includeReferencePrice?: boolean } = {},
): UpdateItemDto {
  return {
    name: data.name.trim(),
    specification: trimFormField(data.specification),
    brand: trimFormField(data.brand),
    group: data.group as ItemGroup,
    unit: data.unit.trim(),
    ...(includeReferencePrice && {
      referencePrice: numberOf(data.referencePrice) ?? null,
    }),
    note: trimFormField(data.note),
  };
}

/** The warehouse fields, all sent so a cleared one persists. */
export function toItemStockSettingsPayload(
  data: ItemFormValues,
): UpdateItemStockSettingsDto {
  return {
    barcode: trimFormField(data.barcode),
    defaultLocationId:
      data.defaultLocationId === "" ? null : Number(data.defaultLocationId),
    minStock: numberOf(data.minStock) ?? null,
  };
}

/** Whether the form holds any warehouse value, so a new item with none needs no second call. */
export function hasStockSettings(data: ItemFormValues): boolean {
  return (
    data.barcode?.trim() !== "" ||
    data.defaultLocationId !== "" ||
    data.minStock !== ""
  );
}

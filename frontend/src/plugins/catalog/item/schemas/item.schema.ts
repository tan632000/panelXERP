import { z } from "zod";

import { optionalMaxString } from "@/kernel/core/lib/validators";

import {
  ITEM_BARCODE_MAX,
  ITEM_CODE_MAX,
  ITEM_GROUPS,
  ITEM_UNIT_MAX,
} from "@plugins/catalog/item/constants";

export interface ItemValidationMessages {
  codeRequired: string;
  codeMax: string;
  nameRequired: string;
  nameMax: string;
  specificationMax: string;
  brandMax: string;
  groupRequired: string;
  unitRequired: string;
  unitMax: string;
  referencePriceInvalid: string;
  noteMax: string;
  barcodeMax: string;
  minStockInvalid: string;
}

export function createItemSchema(messages: ItemValidationMessages) {
  return z.object({
    code: z
      .string()
      .trim()
      .min(1, messages.codeRequired)
      .max(ITEM_CODE_MAX, messages.codeMax),
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .max(255, messages.nameMax),
    specification: optionalMaxString(2000, messages.specificationMax),
    brand: optionalMaxString(255, messages.brandMax),
    group: z
      .string()
      .refine(
        (value) => (ITEM_GROUPS as readonly string[]).includes(value),
        messages.groupRequired,
      ),
    unit: z
      .string()
      .trim()
      .min(1, messages.unitRequired)
      .max(ITEM_UNIT_MAX, messages.unitMax),
    /** Stored form of the masked number input; empty when no price is known. */
    referencePrice: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= 0),
        messages.referencePriceInvalid,
      ),
    note: optionalMaxString(2000, messages.noteMax),
    barcode: optionalMaxString(ITEM_BARCODE_MAX, messages.barcodeMax),
    /** Id of the default location as the select stores it; empty when none. */
    defaultLocationId: z.string(),
    /** Stored form of the masked number input; empty means no low-stock alert. */
    minStock: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= 0),
        messages.minStockInvalid,
      ),
  });
}

export type ItemFormInput = z.input<ReturnType<typeof createItemSchema>>;
export type ItemFormValues = z.output<ReturnType<typeof createItemSchema>>;

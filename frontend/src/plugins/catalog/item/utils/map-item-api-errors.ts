import {
  createApiErrorFormMapper,
  createDeleteToastKeyResolver,
} from "@/kernel/core/lib/api-error-mapping";

export type ItemDeleteToastKey = "deleteInUseDocument";

interface ItemMessages {
  codeExists: string;
  codeIsBarcode: string;
  barcodeTaken: string;
}

export const mapItemApiErrorsToForm = createApiErrorFormMapper<ItemMessages>({
  // Keys resolve against `item.validation`, so a rejection the server phrases in English
  // for the log reaches the input as the same sentence the form uses itself.
  fieldMatchers: [
    [["item code is required"], "code", "codeRequired"],
    [["item code must not exceed"], "code", "codeMax"],
    [["item name is required"], "name", "nameRequired"],
    [["item name must not exceed"], "name", "nameMax"],
    [["specification must"], "specification", "specificationMax"],
    [["brand must"], "brand", "brandMax"],
    [["item group is invalid"], "group", "groupRequired"],
    [["unit is required"], "unit", "unitRequired"],
    [["unit must not exceed"], "unit", "unitMax"],
    [["reference price"], "referencePrice", "referencePriceInvalid"],
    [["note must"], "note", "noteMax"],
    [["barcode must"], "barcode", "barcodeMax"],
    [["minimum stock"], "minStock", "minStockInvalid"],
    [["default location"], "defaultLocationId", "locationInvalid"],
  ],
  // Both conflicts name the barcode; only the one about the item code belongs on the code.
  resolveDuplicateField: (lower, messages) => {
    if (lower.startsWith("barcode")) return ["barcode", messages.barcodeTaken];
    if (lower.includes("as the barcode")) {
      return ["code", messages.codeIsBarcode];
    }
    return ["code", messages.codeExists];
  },
});

export const resolveItemDeleteToastKey =
  createDeleteToastKeyResolver<ItemDeleteToastKey>([
    [["cannot delete", "referenced"], "deleteInUseDocument"],
  ]);

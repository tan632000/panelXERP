"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";

import { ITEM_LABELS_MAX } from "@plugins/catalog/item/constants";
import { useDownloadItemLabels } from "@plugins/catalog/item/hooks/api/useItem";

interface ItemLabelPrintProps {
  ids: number[];
  /** Offers a copies field (the item form); the list's bulk bar prints one of each. */
  withCopies?: boolean;
}

const BUTTON =
  "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-border-secondary bg-surface-primary px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]";

/** Prints Code 128 labels (50 x 30 mm) of the item codes as a PDF download. */
export function ItemLabelPrint({
  ids,
  withCopies = false,
}: Readonly<ItemLabelPrintProps>) {
  const t = useTranslations("item.labels");
  const download = useDownloadItemLabels();
  const [copiesInput, setCopiesInput] = useState<number | null>(1);

  const copies = withCopies ? (copiesInput ?? 0) : 1;
  const valid =
    Number.isInteger(copies) &&
    copies >= 1 &&
    ids.length * copies <= ITEM_LABELS_MAX;

  const print = () => {
    if (valid && !download.isPending) download.mutate({ ids, copies });
  };

  return (
    <div className="flex items-center gap-2">
      {withCopies ? (
        <label className="flex items-center gap-1.5 text-sm text-text-secondary">
          {t("copies")}
          <NumberInput
            decimalScale={0}
            allowNegative={false}
            value={copiesInput}
            onValueChange={setCopiesInput}
            error={!valid}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Inside the item form, Enter would otherwise save it and close the modal.
              event.preventDefault();
              print();
            }}
            className="h-8 w-16 px-2"
          />
        </label>
      ) : null}
      <button
        type="button"
        className={BUTTON}
        disabled={!valid || download.isPending}
        title={t("buttonTitle")}
        onClick={print}
      >
        <Icon name="printer" size={13} />{" "}
        {withCopies ? t("button") : t("buttonCount", { count: ids.length })}
      </button>
    </div>
  );
}

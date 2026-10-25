"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { RecordPickerSourceField } from "@/kernel/core/components/ui/RecordPickerSourceField";

import {
  fetchItemPickerPage,
  itemPickerQueryKey,
} from "@plugins/catalog/_shared/gateways/item-gateway";

import type { TableColumn } from "@/kernel/core/components/ui/Table";
import type { Item } from "@plugins/catalog/item/types";

interface EstimateItemPickerProps {
  /** Called with the catalog item the reader chose; the field itself stays empty for the next. */
  onPick: (item: Item) => void;
  disabled?: boolean;
}

/** Searches the catalog by code or name and hands back the chosen item. */
export function EstimateItemPicker({
  onPick,
  disabled,
}: EstimateItemPickerProps) {
  const t = useTranslations("estimate");

  const columns = useMemo<Array<TableColumn<Item>>>(
    () => [
      { key: "code", header: t("picker.code"), filterable: false },
      { key: "name", header: t("picker.name"), filterable: false },
      { key: "brand", header: t("picker.brand"), filterable: false },
      { key: "unit", header: t("picker.unit"), filterable: false },
    ],
    [t],
  );

  return (
    <RecordPickerSourceField<Item>
      value=""
      onChange={onPick}
      disabled={disabled}
      placeholder={t("bom.addItem")}
      title={t("picker.title")}
      searchPlaceholder={t("picker.searchPlaceholder")}
      emptyText={t("picker.empty")}
      columns={columns}
      rowKey={(item) => String(item.id)}
      getValue={(item) => String(item.id)}
      queryKey={itemPickerQueryKey}
      fetchPage={fetchItemPickerPage}
    />
  );
}

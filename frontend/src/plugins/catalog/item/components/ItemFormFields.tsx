"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormSection } from "@/kernel/core/components/ui/FormSection";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { ITEM_GROUPS } from "@plugins/catalog/item/constants";
import { useLocationList } from "@plugins/catalog/location/hooks/api/useLocation";
import { LocationPermission } from "@plugins/catalog/location/permissions/location-permission.keys";

import type { ItemFormInput } from "@plugins/catalog/item/schemas/item.schema";
import type { Item } from "@plugins/catalog/item/types";
import type { UseFormReturn } from "react-hook-form";

interface ItemFormFieldsProps {
  form: UseFormReturn<ItemFormInput>;
  /** The item being edited; absent when creating one. */
  item?: Item;
  /** Off for an actor who may only edit the warehouse settings. */
  showItemFields?: boolean;
  /** The "Kho" section: barcode, default location and minimum stock. */
  showStockSettings?: boolean;
  /** Off for an actor without `reference_price:read`, who never sees the price. */
  showReferencePrice?: boolean;
}

/** Locations a select can list in one request (the API page cap). */
const LOCATION_OPTION_LIMIT = 100;

export function ItemFormFields({
  form,
  item,
  showItemFields = true,
  showStockSettings = false,
  showReferencePrice = true,
}: ItemFormFieldsProps) {
  const t = useTranslations("item");
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  const groupOptions = ITEM_GROUPS.map((group) => ({
    value: group,
    label: t(`groups.${group}`),
  }));

  return (
    <div className="flex flex-col gap-[11px]">
      {showItemFields && (
        <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
          <FormInput
            label={t("code")}
            // The code is the part number documents snapshot, so it is fixed once created.
            readOnly={Boolean(item)}
            type="text"
            required
            placeholder={t("placeholders.code")}
            error={errors.code?.message}
            {...register("code")}
          />

          <FormSelect
            label={t("group")}
            required
            value={watch("group") ?? ""}
            onChange={(e) =>
              setValue("group", e.target.value, { shouldValidate: true })
            }
            options={groupOptions}
            placeholder={t("placeholders.group")}
            allowCustomInput={false}
            error={errors.group?.message}
          />

          <FormInput
            label={t("name")}
            span2
            required
            placeholder={t("placeholders.name")}
            error={errors.name?.message}
            {...register("name")}
          />

          <FormInput
            label={t("brand")}
            type="text"
            placeholder={t("placeholders.brand")}
            error={errors.brand?.message}
            {...register("brand")}
          />

          <FormInput
            label={t("unit")}
            type="text"
            required
            placeholder={t("placeholders.unit")}
            error={errors.unit?.message}
            {...register("unit")}
          />

          {showReferencePrice && (
            <FormInput
              label={t("referencePrice")}
              type="number"
              decimalScale={2}
              allowNegative={false}
              placeholder={t("placeholders.referencePrice")}
              error={errors.referencePrice?.message}
              {...register("referencePrice")}
            />
          )}

          <FormTextArea
            label={t("specification")}
            span2
            placeholder={t("placeholders.specification")}
            error={errors.specification?.message}
            {...register("specification")}
          />

          <FormTextArea
            label={t("note")}
            span2
            placeholder={t("placeholders.note")}
            error={errors.note?.message}
            {...register("note")}
          />
        </div>
      )}

      {showStockSettings && <StockSettingsSection form={form} item={item} />}
    </div>
  );
}

function StockSettingsSection({
  form,
  item,
}: {
  form: UseFormReturn<ItemFormInput>;
  item?: Item;
}) {
  const t = useTranslations("item");
  const { can } = useAuth();
  const canReadLocations = can(LocationPermission.read);
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;
  const { data: locations } = useLocationList(
    { page: 1, limit: LOCATION_OPTION_LIMIT },
    { enabled: canReadLocations },
  );

  const locationOptions = (locations?.data ?? [])
    .filter((location) => location.isActive)
    .map((location) => ({
      value: String(location.id),
      label: `${location.code} — ${location.name}`,
    }));
  // The current location stays selectable and visible even when it is no longer offered
  // (deactivated, or beyond the first page of locations).
  const current = watch("defaultLocationId");
  if (current && !locationOptions.some((option) => option.value === current)) {
    const known = item?.defaultLocation;
    locationOptions.push({
      value: current,
      label: known ? `${known.code} — ${known.name}` : current,
    });
  }

  return (
    <FormSection title={t("stockSection")} icon="building-warehouse">
      <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
        <FormInput
          label={t("barcode")}
          type="text"
          placeholder={t("placeholders.barcode")}
          error={errors.barcode?.message}
          {...register("barcode")}
        />

        {canReadLocations && (
          <FormSelect
            label={t("defaultLocation")}
            value={watch("defaultLocationId") ?? ""}
            onChange={(e) =>
              setValue("defaultLocationId", e.target.value, {
                shouldValidate: true,
              })
            }
            options={locationOptions}
            placeholder={t("placeholders.defaultLocation")}
            allowCustomInput={false}
            allowClear
            error={errors.defaultLocationId?.message}
          />
        )}

        <FormInput
          label={t("minStock")}
          type="number"
          decimalScale={3}
          allowNegative={false}
          placeholder={t("placeholders.minStock")}
          error={errors.minStock?.message}
          {...register("minStock")}
        />
      </div>
    </FormSection>
  );
}

"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FormCheckbox } from "@/kernel/core/components/ui/FormCheckbox";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { useRouter } from "@/kernel/i18n/navigation";

import {
  DELIVERY_ADDRESS_MAX,
  DELIVERY_NOTE_TEXT_MAX,
  deliveryNotePageRoutes,
} from "@plugins/delivery/delivery-note/constants";
import {
  useCreateDeliveryNote,
  useDeliverableOrders,
  useDeliveryOrder,
} from "@plugins/delivery/delivery-note/hooks/api/useDeliveryNote";
import { refusedUnitCodes } from "@plugins/delivery/delivery-note/utils/refused-units";
import { QcUnitStatusBadge } from "@plugins/delivery/qc-inspection/components/QcStatusBadge";

import type { DeliveryOrderUnit } from "@plugins/delivery/delivery-note/types";

const ICON = "truck";
const SELECT_CLASS =
  "h-[38px] w-full rounded-md border border-border-secondary bg-surface-primary px-2 text-sm";

/** A cabinet goes on a note only once QC passed it and no live note holds it. */
const isDeliverable = (unit: DeliveryOrderUnit) =>
  unit.qcStatus === "passed" && unit.deliveryStatus === "none";

/**
 * A new delivery note: the order is picked from those with cabinets ready to deliver, then the
 * cabinets of it that are. The address starts as the order's site address until it is typed over.
 */
export function DeliveryNoteCreatePage() {
  const t = useTranslations("delivery");
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [plannedDate, setPlannedDate] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const orders = useDeliverableOrders();
  const order = useDeliveryOrder(orderId ? Number(orderId) : null).data;
  const create = useCreateDeliveryNote();

  const refused = refusedUnitCodes(create.error);
  const addressValue = address ?? order?.siteAddress ?? "";

  const toggle = (unitId: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...current, unitId] : current.filter((id) => id !== unitId),
    );

  const submit = () => {
    const trimmedAddress = addressValue.trim();
    const trimmedNote = note.trim();
    create.mutate(
      {
        orderId: Number(orderId),
        unitIds: selected,
        ...(plannedDate ? { plannedDate } : {}),
        ...(trimmedAddress ? { deliveryAddress: trimmedAddress } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      },
      {
        onSuccess: (created) =>
          router.push(deliveryNotePageRoutes.detail(created.id)),
      },
    );
  };

  return (
    <DetailPageLayout
      pageTitle={t("note.title")}
      pageDescription={t("note.create.description")}
      breadcrumbs={[
        { label: t("note.title"), href: deliveryNotePageRoutes.list, icon: ICON },
        { label: t("note.create.title") },
      ]}
      title={t("note.create.title")}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (orderId && selected.length > 0) submit();
        }}
      >
        <DetailSection title={t("note.create.orderSection")}>
          <label className="flex flex-col gap-1 text-sm">
            {t("note.create.order")}
            <select
              aria-label={t("note.create.order")}
              className={SELECT_CLASS}
              value={orderId}
              onChange={(event) => {
                setOrderId(event.target.value);
                setSelected([]);
                setAddress(null);
                create.reset();
              }}
            >
              <option value="">{t("note.create.pickOrder")}</option>
              {(orders.data ?? []).map((option) => (
                <option key={option.orderId} value={option.orderId}>
                  {`${option.code} — ${option.customerName}`}
                </option>
              ))}
            </select>
          </label>
          {orders.data && orders.data.length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">
              {t("note.create.noDeliverableOrders")}
            </p>
          ) : null}
        </DetailSection>

        {order ? (
          <>
            <DetailSection title={t("note.create.units")}>
              <ul className="flex flex-col gap-2">
                {order.units.map((unit) => (
                  <li
                    key={unit.unitId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border-secondary px-3 py-1"
                  >
                    <FormCheckbox
                      label={`${unit.code} · ${unit.tag}`}
                      checked={selected.includes(unit.unitId)}
                      disabled={!isDeliverable(unit)}
                      onChange={(checked) => toggle(unit.unitId, checked)}
                    />
                    <QcUnitStatusBadge status={unit.qcStatus} />
                  </li>
                ))}
              </ul>
            </DetailSection>

            <DetailSection title={t("note.create.details")}>
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <FormControl label={t("note.fields.plannedDate")}>
                  <DateInput value={plannedDate} onChange={setPlannedDate} />
                </FormControl>
                <FormInput
                  label={t("note.fields.address")}
                  aria-label={t("note.fields.address")}
                  value={addressValue}
                  maxLength={DELIVERY_ADDRESS_MAX}
                  onChange={(event) => setAddress(event.target.value)}
                />
                <div className="col-span-2 max-md:col-span-1">
                  <FormTextArea
                    label={t("note.fields.note")}
                    value={note}
                    maxLength={DELIVERY_NOTE_TEXT_MAX}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>
            </DetailSection>
          </>
        ) : null}

        {refused ? (
          <p role="alert" className="text-sm text-danger-text">
            {t("note.create.refused", { codes: refused })}
          </p>
        ) : null}
        <div>
          <Button
            type="submit"
            disabled={!orderId || selected.length === 0 || create.isPending}
          >
            {t("note.create.submit")}
          </Button>
        </div>
      </form>
    </DetailPageLayout>
  );
}

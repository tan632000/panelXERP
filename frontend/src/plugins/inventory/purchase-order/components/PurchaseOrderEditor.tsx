"use client";

import { useTranslations } from "next-intl";
import React, { useMemo, useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LINE_TABLE_SCROLL_CLASS } from "@/kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@/kernel/core/components/ui/NumberInput";
import { RecordPickerSourceField } from "@/kernel/core/components/ui/RecordPickerSourceField";
import { formatCurrency, formatNumber } from "@/kernel/core/lib/formatters";

import {
  fetchItemPickerPage,
  itemPickerQueryKey,
} from "@plugins/catalog/_shared/gateways/item-gateway";
import {
  PURCHASE_ORDER_NOTE_MAX,
  PURCHASE_ORDER_QUANTITY_DECIMALS,
  PURCHASE_ORDER_VAT_RATES,
} from "@plugins/inventory/purchase-order/constants";
import {
  previewLineAmount,
  previewOrderTotals,
} from "@plugins/inventory/purchase-order/utils/purchase-order-pricing";
import { getSuppliers } from "@plugins/inventory/supplier/services/supplier.service";

import type { TableColumn } from "@/kernel/core/components/ui/Table";
import type { Item } from "@plugins/catalog/item/types";
import type {
  PurchaseOrderDetail,
  PurchaseOrderInput,
} from "@plugins/inventory/purchase-order/types";
import type { Supplier } from "@plugins/inventory/supplier/types";

const CELL = "border-b border-border-secondary px-2 py-1.5 align-middle";
const HEAD =
  "border-b border-border-secondary bg-surface-secondary px-2 py-2 text-left text-xs font-semibold uppercase text-text-tertiary";
const NUMBER_CELL = `${CELL} text-right tabular-nums`;

interface DraftLine {
  /** Stable row key while lines are added and removed before saving. */
  key: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  quantity: string;
  unitPrice: string;
  /**
   * Taken from a purchase request: the server refuses a save that changes its quantity or
   * drops it, so the row offers neither.
   */
  fromRequest: boolean;
}

interface DraftOrder {
  supplierId: number | null;
  supplierLabel: string;
  expectedDate: string;
  vatRate: number;
  note: string;
  lines: DraftLine[];
}

function fromOrder(order?: PurchaseOrderDetail): DraftOrder {
  if (!order) {
    return {
      supplierId: null,
      supplierLabel: "",
      expectedDate: "",
      vatRate: 10,
      note: "",
      lines: [],
    };
  }
  return {
    supplierId: order.supplierId,
    supplierLabel: `${order.supplierCode} — ${order.supplierName}`,
    expectedDate: order.expectedDate ?? "",
    vatRate: order.vatRate ?? 10,
    note: order.note ?? "",
    lines: order.lines.map((line) => ({
      key: `line-${line.id}`,
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      itemUnit: line.itemUnit,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice ?? 0),
      fromRequest: Boolean(line.fromRequest),
    })),
  };
}

export interface PurchaseOrderEditorProps {
  /** The draft being edited; absent for a new order. */
  order?: PurchaseOrderDetail;
  pending: boolean;
  onSave: (input: PurchaseOrderInput) => void;
}

/**
 * Header and lines of a draft. The totals shown move with what is typed; the server computes
 * the stored ones on save.
 */
export function PurchaseOrderEditor({
  order,
  pending,
  onSave,
}: PurchaseOrderEditorProps) {
  const t = useTranslations("purchaseOrder");
  const [draft, setDraft] = useState<DraftOrder>(() => fromOrder(order));
  const [showErrors, setShowErrors] = useState(false);

  const totals = previewOrderTotals(draft.lines, draft.vatRate);
  const invalidLine = draft.lines.some(
    (line) => !(Number(line.quantity) > 0) || line.unitPrice === "",
  );
  const supplierMissing = draft.supplierId === null;
  const hasRequestLines = draft.lines.some((line) => line.fromRequest);

  const supplierColumns = useMemo<Array<TableColumn<Supplier>>>(
    () => [
      { key: "code", header: t("picker.code"), filterable: false },
      { key: "name", header: t("picker.name"), filterable: false },
    ],
    [t],
  );
  const itemColumns = useMemo<Array<TableColumn<Item>>>(
    () => [
      { key: "code", header: t("picker.code"), filterable: false },
      { key: "name", header: t("picker.name"), filterable: false },
      { key: "unit", header: t("picker.unit"), filterable: false },
    ],
    [t],
  );

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.key === key ? { ...line, ...patch } : line,
      ),
    }));

  const save = () => {
    setShowErrors(true);
    if (supplierMissing || invalidLine || draft.supplierId === null) return;
    onSave({
      supplierId: draft.supplierId,
      expectedDate: draft.expectedDate || null,
      vatRate: draft.vatRate,
      note: draft.note.trim() || null,
      lines: draft.lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      })),
    });
  };

  return (
    <DetailSection title={t("editorTitle")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormControl
            label={t("supplier")}
            required
            error={
              showErrors && supplierMissing ? t("supplierRequired") : undefined
            }
          >
            <RecordPickerSourceField<Supplier>
              value={draft.supplierId ? String(draft.supplierId) : ""}
              displayLabel={draft.supplierLabel}
              onChange={(supplier) =>
                setDraft((current) => ({
                  ...current,
                  supplierId: supplier.id,
                  supplierLabel: `${supplier.code} — ${supplier.name}`,
                }))
              }
              placeholder={t("supplierPlaceholder")}
              title={t("picker.supplierTitle")}
              searchPlaceholder={t("picker.searchPlaceholder")}
              emptyText={t("picker.empty")}
              columns={supplierColumns}
              rowKey={(supplier) => String(supplier.id)}
              getValue={(supplier) => String(supplier.id)}
              queryKey={(search) => ["suppliers", "picker", search] as const}
              fetchPage={getSuppliers}
            />
          </FormControl>
          <FormControl label={t("expectedDate")}>
            <DateInput
              value={draft.expectedDate}
              onChange={(value) =>
                setDraft((current) => ({ ...current, expectedDate: value }))
              }
            />
          </FormControl>
          <FormSelect
            label={t("vatRate")}
            searchable={false}
            value={String(draft.vatRate)}
            options={PURCHASE_ORDER_VAT_RATES.map((rate) => ({
              value: String(rate),
              label: `${rate}%`,
            }))}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                vatRate: Number(event.target.value),
              }))
            }
          />
          <FormTextArea
            label={t("note")}
            maxLength={PURCHASE_ORDER_NOTE_MAX}
            value={draft.note}
            onChange={(event) =>
              setDraft((current) => ({ ...current, note: event.target.value }))
            }
          />
        </div>

        <div className={LINE_TABLE_SCROLL_CLASS}>
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{t("lines.code")}</th>
                <th className={HEAD}>{t("lines.name")}</th>
                <th className={HEAD}>{t("lines.unit")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.quantity")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.unitPrice")}</th>
                <th className={`${HEAD} text-right`}>{t("lines.amount")}</th>
                <th className={`${HEAD} w-12`} />
              </tr>
            </thead>
            <tbody>
              {draft.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className={`${CELL} text-center text-text-secondary`}
                  >
                    {t("lines.empty")}
                  </td>
                </tr>
              ) : null}
              {draft.lines.map((line) => (
                <tr key={line.key}>
                  <td className={`${CELL} font-mono`}>{line.itemCode}</td>
                  <td className={CELL}>{line.itemName}</td>
                  <td className={CELL}>{line.itemUnit}</td>
                  <td className={NUMBER_CELL}>
                    {line.fromRequest ? (
                      formatNumber(Number(line.quantity), {
                        maximumFractionDigits: PURCHASE_ORDER_QUANTITY_DECIMALS,
                      })
                    ) : (
                      <NumberInput
                        aria-label={t("lines.quantityOf", {
                          code: line.itemCode,
                        })}
                        className="w-28 text-right"
                        value={line.quantity}
                        decimalScale={PURCHASE_ORDER_QUANTITY_DECIMALS}
                        allowNegative={false}
                        error={showErrors && !(Number(line.quantity) > 0)}
                        onChange={(event) =>
                          patchLine(line.key, { quantity: event.target.value })
                        }
                      />
                    )}
                  </td>
                  <td className={NUMBER_CELL}>
                    <NumberInput
                      aria-label={t("lines.unitPriceOf", {
                        code: line.itemCode,
                      })}
                      className="w-36 text-right"
                      value={line.unitPrice}
                      decimalScale={0}
                      allowNegative={false}
                      error={showErrors && line.unitPrice === ""}
                      onChange={(event) =>
                        patchLine(line.key, { unitPrice: event.target.value })
                      }
                    />
                  </td>
                  <td className={`${NUMBER_CELL} font-semibold`}>
                    {formatCurrency(previewLineAmount(line))}
                  </td>
                  <td className={CELL}>
                    {line.fromRequest ? null : (
                      <button
                        type="button"
                        className="cursor-pointer text-danger-text"
                        aria-label={t("lines.remove", { code: line.itemCode })}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            lines: current.lines.filter(
                              (entry) => entry.key !== line.key,
                            ),
                          }))
                        }
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasRequestLines ? (
          <p className="text-xs text-text-secondary">
            {t("lines.fromRequestHint")}
          </p>
        ) : null}

        <div className="max-w-md">
          <RecordPickerSourceField<Item>
            value=""
            onChange={(item) =>
              setDraft((current) => ({
                ...current,
                lines: [
                  ...current.lines,
                  {
                    key: `new-${item.id}-${current.lines.length}-${Date.now()}`,
                    itemId: item.id,
                    itemCode: item.code,
                    itemName: item.name,
                    itemUnit: item.unit,
                    quantity: "1",
                    // The catalog reference price is not what this supplier charges.
                    unitPrice: "",
                    fromRequest: false,
                  },
                ],
              }))
            }
            placeholder={t("lines.addItem")}
            title={t("picker.itemTitle")}
            searchPlaceholder={t("picker.searchPlaceholder")}
            emptyText={t("picker.empty")}
            columns={itemColumns}
            rowKey={(item) => String(item.id)}
            getValue={(item) => String(item.id)}
            queryKey={itemPickerQueryKey}
            fetchPage={fetchItemPickerPage}
          />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-text-secondary">{t("subtotal")}</dt>
            <dd className="text-right tabular-nums" data-testid="po-subtotal">
              {formatCurrency(totals.subtotal)}
            </dd>
            <dt className="text-text-secondary">
              {t("vatAmountOf", { rate: draft.vatRate })}
            </dt>
            <dd className="text-right tabular-nums">
              {formatCurrency(totals.vatAmount)}
            </dd>
            <dt className="font-semibold">{t("total")}</dt>
            <dd
              className="text-right font-semibold tabular-nums"
              data-testid="po-total"
            >
              {formatCurrency(totals.total)}
            </dd>
          </dl>
          <Button onClick={save} disabled={pending}>
            {t("save")}
          </Button>
        </div>
      </div>
    </DetailSection>
  );
}

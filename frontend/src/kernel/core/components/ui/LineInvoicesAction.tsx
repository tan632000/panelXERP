"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import api from "@/kernel/core/api/api";
import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { HorizontalScrollArea } from "@/kernel/core/components/ui/HorizontalScrollArea";
import {
  LINE_CELL_CLASS,
  LINE_HEADER_CELL_CLASS,
  LINE_INPUT_CLASS,
  LINE_TABLE_SCROLL_CLASS,
} from "@/kernel/core/components/ui/line-table-styles";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useCanEditLineInvoices } from "@/kernel/core/hooks/useCanEditLineInvoices";
import { useMutationFeedback } from "@/kernel/core/hooks/useMutationFeedback";

/** The invoice fields a document line may carry; NG-type lines keep only the first two. */
export type LineInvoiceField =
  "invoiceNo" | "invoiceDate" | "invoiceForm" | "invoiceSerial";

export const ALL_LINE_INVOICE_FIELDS: readonly LineInvoiceField[] = [
  "invoiceNo",
  "invoiceDate",
  "invoiceForm",
  "invoiceSerial",
];

export const LINE_INVOICE_NO_DATE_FIELDS: readonly LineInvoiceField[] = [
  "invoiceNo",
  "invoiceDate",
];

export type LineInvoiceValues = Partial<
  Record<LineInvoiceField, string | null>
>;

/** One document line as the modal lists it: who it is, and its stored invoice values. */
export interface LineInvoiceRow extends LineInvoiceValues {
  id: number;
  /** The line's identity as the reader knows it, e.g. a material code. */
  label: string;
  /** A second line under the label, e.g. the material name. */
  description?: string | null;
}

/** Length caps the server enforces, so a too-long value never leaves the form. */
const MAX_LENGTH: Record<Exclude<LineInvoiceField, "invoiceDate">, number> = {
  invoiceNo: 50,
  invoiceForm: 20,
  invoiceSerial: 20,
};

export interface LineInvoicesActionProps {
  /** The document's `PATCH …/:id/invoices` endpoint. */
  endpoint: string;
  lines: LineInvoiceRow[];
  fields?: readonly LineInvoiceField[];
  /** The document's query-key root, refreshed once the invoices are saved. */
  invalidateKey: QueryKey;
  /**
   * The document's `<res>:invoice:write` scope — the permission matrix decides who may edit.
   * When absent, `roles` applies (documents not yet migrated to a scope).
   */
  permission?: string;
  /** Roles that may edit this document's invoices; defaults to the shared list. */
  roles?: readonly string[];
}

function toDraft(
  lines: LineInvoiceRow[],
  fields: readonly LineInvoiceField[],
): Record<number, Record<LineInvoiceField, string>> {
  return Object.fromEntries(
    lines.map((line) => [
      line.id,
      Object.fromEntries(
        fields.map((field) => [field, line[field] ?? ""]),
      ) as Record<LineInvoiceField, string>,
    ]),
  );
}

/**
 * Customer feedback 2026-10-05 — the purchasing team fills the supplier's invoice on a
 * delivery note or a warehouse receipt, at any status, and changes nothing else. The header
 * button shows only for the users the server accepts; the modal lists every line with its
 * invoice fields alone, so no other field of the document is reachable from here.
 */
export function LineInvoicesAction(props: Readonly<LineInvoicesActionProps>) {
  const t = useTranslations("common.lineInvoices");
  const canEdit = useCanEditLineInvoices(props.roles, props.permission);
  const [open, setOpen] = useState(false);
  if (!canEdit || props.lines.length === 0) return null;

  return (
    <>
      <DetailPanelActionButton
        icon="file-invoice"
        iconOnly
        aria-label={t("button")}
        title={t("button")}
        onClick={() => setOpen(true)}
      />
      {/* Mounted only while open: each opening starts from the stored values, and a page that
          never opens it never reaches for the query client or the notification context. */}
      {open ? (
        <LineInvoicesEditor {...props} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function LineInvoicesEditor({
  endpoint,
  lines,
  fields = ALL_LINE_INVOICE_FIELDS,
  invalidateKey,
  onClose,
}: Readonly<LineInvoicesActionProps & { onClose: () => void }>) {
  const t = useTranslations("common.lineInvoices");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => toDraft(lines, fields));

  const mutation = useMutationFeedback({
    mutationFn: async (payload: {
      lines: Array<{ id: number } & LineInvoiceValues>;
    }) => {
      await api.patch(endpoint, payload);
    },
    successMessage: t("saveSuccess"),
    errorMessage: t("saveError"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      onClose();
    },
  });

  const setValue = (id: number, field: LineInvoiceField, value: string) =>
    setDraft((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));

  // One supplier invoice usually covers the whole document, so the first line's values can
  // be copied down instead of typed again on every line.
  const applyFirstToAll = () => {
    const first = draft[lines[0].id];
    setDraft(Object.fromEntries(lines.map((line) => [line.id, { ...first }])));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      lines: lines.map((line) => ({
        id: line.id,
        ...Object.fromEntries(
          fields.map((field) => [field, draft[line.id][field].trim() || null]),
        ),
      })),
    });
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={t("title")}
        onSubmit={submit}
        submitLabel={t("save")}
        submitDisabled={mutation.isPending}
        extraWide
        secondaryAction={
          lines.length > 1
            ? { label: t("applyFirstToAll"), onClick: applyFirstToAll }
            : undefined
        }
      >
        <p className="mb-3 text-sm text-text-secondary">{t("description")}</p>
        <HorizontalScrollArea className={LINE_TABLE_SCROLL_CLASS}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={LINE_HEADER_CELL_CLASS}>{t("line")}</th>
                {fields.map((field) => (
                  <th key={field} className={LINE_HEADER_CELL_CLASS}>
                    {t(`fields.${field}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  {/* The line it belongs to heads the block on a phone, across both columns. */}
                  <td
                    className={`${LINE_CELL_CLASS} min-w-[180px] max-lg:col-span-full`}
                  >
                    <div className="text-sm font-medium text-text-primary">
                      {line.label}
                    </div>
                    {line.description ? (
                      <div className="text-xs text-text-tertiary">
                        {line.description}
                      </div>
                    ) : null}
                  </td>
                  {fields.map((field) => (
                    <td
                      key={field}
                      className={`${LINE_CELL_CLASS} min-w-[150px]`}
                    >
                      {field === "invoiceDate" ? (
                        <DateInput
                          value={draft[line.id]?.[field] ?? ""}
                          onChange={(value) => setValue(line.id, field, value)}
                        />
                      ) : (
                        <input
                          className={LINE_INPUT_CLASS}
                          value={draft[line.id]?.[field] ?? ""}
                          maxLength={MAX_LENGTH[field]}
                          aria-label={t(`fields.${field}`)}
                          onChange={(event) =>
                            setValue(line.id, field, event.target.value)
                          }
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScrollArea>
      </Modal>
    </>
  );
}

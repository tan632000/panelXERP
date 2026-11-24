"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { shouldSuppressInlineFormErrorToast } from "@/kernel/core/lib/api-error-mapping";

import { EstimateItemPicker } from "@plugins/sales/estimate/components/EstimateItemPicker";
import { TEMPLATE_CODE_PREFIX } from "@plugins/sales/template/constants";
import {
  useCreateTemplate,
  useTemplateDetail,
  resolveTemplateErrorKey,
  useUpdateTemplate,
} from "@plugins/sales/template/hooks/useTemplates";

import type { Item } from "@plugins/catalog/item/types";
import type {
  CreateTemplateDto,
  QuotationTemplate,
  QuotationTemplateDetail,
} from "@plugins/sales/template/types";

interface LineState {
  itemId: number;
  label: string;
  quantity: string;
  groupLabel: string;
  note: string;
}

interface PanelState {
  tag: string;
  description: string;
  quantity: string;
  lines: LineState[];
}

interface FormState {
  code: string;
  name: string;
  description: string;
  panels: PanelState[];
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  panels: [],
};
const EMPTY_PANEL: PanelState = {
  tag: "",
  description: "",
  quantity: "1",
  lines: [],
};
const ICON_BUTTON =
  "inline-flex h-[27px] w-[27px] cursor-pointer items-center justify-center rounded-md border border-border-secondary text-danger-text hover:bg-surface-secondary";

/** Returns the i18n keys (`template.validation`) of every rule the form breaks. */
function validate(form: FormState, isNew: boolean): Array<[string, string?]> {
  const errors: Array<[string, string?]> = [];
  if (isNew) {
    const code = form.code.trim();
    if (!code) errors.push(["codeRequired"]);
    else if (!code.startsWith(TEMPLATE_CODE_PREFIX)) {
      errors.push(["codePrefix"]);
    }
  }
  if (!form.name.trim()) errors.push(["nameRequired"]);
  const seen = new Set<string>();
  for (const panel of form.panels) {
    const tag = panel.tag.trim();
    if (!tag) errors.push(["tagRequired"]);
    else if (seen.has(tag.toLowerCase())) errors.push(["tagDuplicate", tag]);
    seen.add(tag.toLowerCase());
    const count = Number(panel.quantity);
    if (!Number.isInteger(count) || count < 1) errors.push(["panelQuantity"]);
    if (panel.lines.some((line) => !(Number(line.quantity) > 0))) {
      errors.push(["lineQuantity"]);
    }
  }
  return errors;
}

function toPayload(form: FormState): CreateTemplateDto {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    panels: form.panels.map((panel) => ({
      tag: panel.tag.trim(),
      description: panel.description.trim() || null,
      quantity: Number(panel.quantity),
      lines: panel.lines.map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        groupLabel: line.groupLabel.trim() || null,
        note: line.note.trim() || null,
      })),
    })),
  };
}

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The template being edited; absent when creating a new one. */
  template?: QuotationTemplate | null;
}

function toFormState(detail: QuotationTemplateDetail | undefined): FormState {
  if (!detail) return EMPTY_FORM;
  return {
    code: detail.code,
    name: detail.name,
    description: detail.description ?? "",
    panels: detail.panels.map((panel) => ({
      tag: panel.tag,
      description: panel.description ?? "",
      quantity: String(panel.quantity),
      lines: panel.lines.map((line) => ({
        itemId: line.itemId,
        label: [line.itemCode, line.itemName].filter(Boolean).join(" — "),
        quantity: String(line.quantity),
        groupLabel: line.groupLabel ?? "",
        note: line.note ?? "",
      })),
    })),
  };
}

/** Loads the template being edited, then mounts the form with that content as its initial state. */
export function TemplateFormModal({
  isOpen,
  onClose,
  template,
}: TemplateFormModalProps) {
  const t = useTranslations("template");
  const tCommon = useTranslations("common");
  const detail = useTemplateDetail(isOpen && template ? template.id : null);

  if (!isOpen) return null;
  if (template && !detail.data) {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title={t("editModalTitle", { code: template.code })}
        cancelLabel={tCommon("cancel")}
        submitDisabled
      >
        <p className="text-sm text-text-secondary">{t("loading")}</p>
      </Modal>
    );
  }
  return (
    <TemplateForm
      key={template?.id ?? "new"}
      onClose={onClose}
      template={template}
      initial={toFormState(detail.data)}
    />
  );
}

interface TemplateFormProps {
  onClose: () => void;
  template?: QuotationTemplate | null;
  initial: FormState;
}

function TemplateForm({ onClose, template, initial }: TemplateFormProps) {
  const t = useTranslations("template");
  const tCommon = useTranslations("common");
  const tToast = useTranslations("template.toast");
  const { showError } = useNotification();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Array<[string, string?]>>([]);

  const patch = (changes: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...changes }));
  const patchPanel = (index: number, changes: Partial<PanelState>) =>
    patch({
      panels: form.panels.map((p, i) =>
        i === index ? { ...p, ...changes } : p,
      ),
    });
  const patchLine = (pi: number, li: number, changes: Partial<LineState>) =>
    patchPanel(pi, {
      lines: form.panels[pi].lines.map((l, i) =>
        i === li ? { ...l, ...changes } : l,
      ),
    });
  const addLine = (pi: number, item: Item) =>
    patchPanel(pi, {
      lines: [
        ...form.panels[pi].lines,
        {
          itemId: item.id,
          label: `${item.code} — ${item.name}`,
          quantity: "1",
          groupLabel: "",
          note: "",
        },
      ],
    });

  const handleSave = async () => {
    const found = validate(form, !template);
    setErrors(found);
    if (found.length > 0) return;
    const payload = toPayload(form);
    try {
      if (template) {
        const { code: _code, ...data } = payload;
        await updateMutation.mutateAsync({ id: template.id, data });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (error: unknown) {
      // The mutation hook toasts the localized 400/409 reason, except for a duplicate-value 409
      // it assumes a form shows inline; this form has no per-field slot, so it says it here.
      const key = resolveTemplateErrorKey(error);
      if (key && shouldSuppressInlineFormErrorToast(error)) {
        showError(tToast(key));
      }
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        template
          ? t("editModalTitle", { code: template.code })
          : t("addModalTitle")
      }
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      submitDisabled={createMutation.isPending || updateMutation.isPending}
      extraWide
    >
      <div className="space-y-4">
        {errors.length > 0 && (
          <ul className="space-y-1 text-xs text-danger-text">
            {errors.map(([key, tag]) => (
              <li key={`${key}-${tag ?? ""}`}>
                {t(`validation.${key}`, { tag: tag ?? "" })}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label={t("code")}
            required
            value={form.code}
            readOnly={Boolean(template)}
            placeholder={t("placeholders.code")}
            onChange={(e) => patch({ code: e.target.value })}
          />
          <FormInput
            label={t("name")}
            required
            value={form.name}
            placeholder={t("placeholders.name")}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <FormInput
            label={t("descriptionField")}
            span2
            value={form.description}
            placeholder={t("placeholders.description")}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("panels.title")}
          </h3>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border-secondary px-3 py-1 text-sm hover:bg-surface-secondary"
            onClick={() => patch({ panels: [...form.panels, EMPTY_PANEL] })}
          >
            <Icon name="plus" size={14} />
            {t("panels.add")}
          </button>
        </div>
        {form.panels.length === 0 && (
          <p className="text-sm text-text-secondary">{t("panels.empty")}</p>
        )}

        {form.panels.map((panel, pi) => (
          <div
            key={pi}
            className="space-y-3 rounded-md border border-border-secondary p-3"
          >
            <div className="grid grid-cols-[1fr_2fr_6rem_auto] items-end gap-3">
              <FormInput
                label={t("panels.tag")}
                value={panel.tag}
                placeholder={t("placeholders.panelTag")}
                onChange={(e) => patchPanel(pi, { tag: e.target.value })}
              />
              <FormInput
                label={t("panels.description")}
                value={panel.description}
                onChange={(e) =>
                  patchPanel(pi, { description: e.target.value })
                }
              />
              <FormInput
                label={t("panels.quantity")}
                type="number"
                decimalScale={0}
                allowNegative={false}
                value={panel.quantity}
                onChange={(e) => patchPanel(pi, { quantity: e.target.value })}
              />
              <button
                type="button"
                className={ICON_BUTTON}
                title={t("panels.remove")}
                onClick={() =>
                  patch({ panels: form.panels.filter((_, i) => i !== pi) })
                }
              >
                <Icon name="trash" size={15} />
              </button>
            </div>

            {panel.lines.length === 0 && (
              <p className="text-sm text-text-secondary">
                {t("panels.noLines")}
              </p>
            )}
            {panel.lines.map((line, li) => (
              <div
                key={li}
                className="grid grid-cols-[2fr_6rem_1fr_1fr_auto] items-end gap-3"
              >
                <span
                  className="truncate text-sm text-text-primary"
                  title={line.label}
                >
                  {line.label}
                </span>
                <FormInput
                  label={t("panels.quantityHeader")}
                  labelHidden
                  aria-label={t("panels.quantityHeader")}
                  type="number"
                  decimalScale={3}
                  allowNegative={false}
                  value={line.quantity}
                  onChange={(e) =>
                    patchLine(pi, li, { quantity: e.target.value })
                  }
                />
                <FormInput
                  label={t("panels.groupHeader")}
                  labelHidden
                  value={line.groupLabel}
                  placeholder={t("placeholders.groupLabel")}
                  onChange={(e) =>
                    patchLine(pi, li, { groupLabel: e.target.value })
                  }
                />
                <FormInput
                  label={t("panels.noteHeader")}
                  labelHidden
                  value={line.note}
                  placeholder={t("placeholders.note")}
                  onChange={(e) => patchLine(pi, li, { note: e.target.value })}
                />
                <button
                  type="button"
                  className={ICON_BUTTON}
                  title={t("panels.removeLine")}
                  onClick={() =>
                    patchPanel(pi, {
                      lines: panel.lines.filter((_, i) => i !== li),
                    })
                  }
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            <EstimateItemPicker onPick={(item) => addLine(pi, item)} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

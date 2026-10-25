"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { Modal } from "@/kernel/core/components/ui/Modal";

import {
  ESTIMATE_DESCRIPTION_MAX,
  ESTIMATE_PANEL_QUANTITY_MAX,
  ESTIMATE_TAG_MAX,
} from "@plugins/sales/estimate/constants";
import { parseDraft } from "@plugins/sales/estimate/utils/estimate-drafts";

import type { CreatePanelDto } from "@plugins/sales/estimate/types";

interface EstimatePanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves when the server accepted the panel; rejects when it refused, keeping the modal open. */
  onSubmit: (data: CreatePanelDto) => Promise<unknown>;
  /** The panel being edited; absent when adding one. */
  panel?: { tag: string; description?: string | null; quantity: number };
}

export function EstimatePanelModal({
  isOpen,
  onClose,
  onSubmit,
  panel,
}: EstimatePanelModalProps) {
  const t = useTranslations("estimate");
  const tCommon = useTranslations("common");

  const [tag, setTag] = useState(panel?.tag ?? "");
  const [description, setDescription] = useState(panel?.description ?? "");
  const [quantity, setQuantity] = useState(String(panel?.quantity ?? 1));
  const [errors, setErrors] = useState<{ tag?: string; quantity?: string }>({});
  const [pending, setPending] = useState(false);

  // Resets the fields the moment the modal opens, without an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setTag(panel?.tag ?? "");
      setDescription(panel?.description ?? "");
      setQuantity(String(panel?.quantity ?? 1));
      setErrors({});
    }
  }

  const handleSubmit = async () => {
    const parsedQuantity = parseDraft(quantity, {
      positive: true,
      integer: true,
    });
    const next = {
      tag: tag.trim() ? undefined : t("validation.tagRequired"),
      quantity:
        parsedQuantity === null || parsedQuantity > ESTIMATE_PANEL_QUANTITY_MAX
          ? t("validation.quantityInvalid", {
              max: ESTIMATE_PANEL_QUANTITY_MAX,
            })
          : undefined,
    };
    setErrors(next);
    if (next.tag || next.quantity || parsedQuantity === null) return;

    setPending(true);
    try {
      await onSubmit({
        tag: tag.trim(),
        description: description.trim() || null,
        quantity: parsedQuantity,
      });
      onClose();
    } catch {
      // The mutation toasts the refusal; the modal stays open for the reader to fix it.
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={panel ? t("panel.editTitle") : t("panel.addTitle")}
      submitLabel={tCommon("save")}
      cancelLabel={tCommon("cancel")}
      submitDisabled={pending}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex flex-col gap-4">
        <FormInput
          label={t("panel.tag")}
          required
          value={tag}
          maxLength={ESTIMATE_TAG_MAX}
          placeholder={t("placeholders.tag")}
          error={errors.tag}
          onChange={(event) => setTag(event.target.value)}
        />
        <FormInput
          label={t("panel.description")}
          value={description}
          maxLength={ESTIMATE_DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FormInput
          label={t("panel.quantity")}
          required
          type="number"
          decimalScale={0}
          allowNegative={false}
          value={quantity}
          error={errors.quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </div>
    </Modal>
  );
}

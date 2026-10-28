"use client";

import { isAxiosError } from "axios";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FileDropzone } from "@/kernel/core/components/ui/FileDropzone";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { downloadBlob } from "@/kernel/core/lib/download-blob";
import {
  extractApiErrorMessage,
  type ApiErrorBody,
} from "@/kernel/core/lib/errors";

import { ITEM_IMPORT_MAX_BYTES } from "@plugins/catalog/item/constants";
import { useImportItems } from "@plugins/catalog/item/hooks/api/useItem";
import { fetchItemImportTemplate } from "@plugins/catalog/item/services/item.service";

import type {
  ItemImportResult,
  ItemImportRowError,
} from "@plugins/catalog/item/types";

/** Mounted only while open, so every opening starts without the last file or result. */
interface ItemImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** The reason keys the server's wording maps to; anything else is shown as sent. */
const REASON_RULES: ReadonlyArray<readonly [prefix: string, key: string]> = [
  ["missing code", "missingCode"],
  ["missing unit", "missingUnit"],
  ["code already exists", "codeExists"],
  ["code is already the barcode", "codeIsBarcode"],
  ["code repeated with different data", "codeRepeated"],
  ["group must be one of", "groupInvalid"],
  ["reference price", "priceInvalid"],
];

const KNOWN_FIELDS = new Set([
  "code",
  "name",
  "brand",
  "unit",
  "group",
  "referencePrice",
  "specification",
  "note",
]);

export function ItemImportDialog({ isOpen, onClose }: ItemImportDialogProps) {
  const t = useTranslations("item.import");
  const tFields = useTranslations("item");
  const tCommon = useTranslations("common");
  const importMutation = useImportItems();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ItemImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reasonText = (reason: string) => {
    const rule = REASON_RULES.find(([prefix]) => reason.startsWith(prefix));
    return rule ? t(`reasons.${rule[1]}`) : reason;
  };

  const fieldText = (field: string) =>
    KNOWN_FIELDS.has(field) ? tFields(field) : field;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setFailure(null);
    try {
      setResult(await importMutation.mutateAsync(file));
    } catch (error: unknown) {
      const message = isAxiosError(error)
        ? extractApiErrorMessage(
            error.response?.data as ApiErrorBody | undefined,
          )
        : undefined;
      setFailure(message ?? t("failed"));
    }
  };

  const handleTemplate = async () => {
    try {
      downloadBlob(
        await fetchItemImportTemplate(),
        "item-import-template.xlsx",
      );
    } catch {
      setFailure(t("templateFailed"));
    }
  };

  const errors: ItemImportRowError[] = result?.errors ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("title")}
      onSubmit={handleSubmit}
      submitLabel={t("submit")}
      cancelLabel={result ? tCommon("close") : tCommon("cancel")}
      hideSubmit={result !== null}
      submitDisabled={!file || importMutation.isPending}
      submitIcon="upload"
      wide
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">{t("description")}</p>

        {result ? null : (
          <>
            <FileDropzone
              accept=".xlsx"
              maxBytes={ITEM_IMPORT_MAX_BYTES}
              disabled={importMutation.isPending}
              title={file ? file.name : t("dropTitle")}
              subtitle={t("dropSubtitle")}
              hint={t("dropHint")}
              invalidTypeMessage={t("invalidType")}
              tooLargeMessage={t("tooLarge")}
              onFile={setFile}
            />
            <button
              type="button"
              className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-brand hover:underline"
              onClick={handleTemplate}
            >
              <Icon name="download" size={16} />
              {t("downloadTemplate")}
            </button>
          </>
        )}

        {failure ? (
          <p role="alert" className="text-sm text-danger-text">
            {failure}
          </p>
        ) : null}

        {result ? (
          <div className="flex flex-col gap-2" data-testid="import-result">
            <p className="text-sm font-semibold text-text-primary">
              {t("created", { count: result.created })}
            </p>
            {errors.length > 0 ? (
              <>
                <p className="text-sm text-danger-text">
                  {t("rejected", { count: errors.length })}
                </p>
                <div className="max-h-72 overflow-auto rounded-md border border-border-secondary">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-secondary text-text-secondary">
                      <tr>
                        <th className="px-3 py-2">{t("columnRow")}</th>
                        <th className="px-3 py-2">{t("columnField")}</th>
                        <th className="px-3 py-2">{t("columnReason")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((error, index) => (
                        <tr
                          key={`${error.row}-${error.field}-${index}`}
                          className="border-t border-border-secondary"
                        >
                          <td className="px-3 py-1.5">{error.row}</td>
                          <td className="px-3 py-1.5">
                            {fieldText(error.field)}
                          </td>
                          <td className="px-3 py-1.5">
                            {reasonText(error.reason)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

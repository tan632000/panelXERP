"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";

import { TERM_MAX, TERMS_MAX_COUNT } from "@plugins/sales/quotation/constants";

import type { QuotationVersion } from "@plugins/sales/quotation/types";

interface QuotationTermsEditorProps {
  version: QuotationVersion;
  /** True for the newest version while it is a draft and the reader may edit it. */
  editable: boolean;
  saving: boolean;
  onSave: (terms: string[]) => void;
  /** Told whether the typed terms differ from the stored ones. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The numbered terms printed under the quotation table (warranty, delivery, payment, validity).
 * Each version carries its own copy, copied forward on every revision; only a draft edits it.
 */
export function QuotationTermsEditor({
  version,
  editable,
  saving,
  onSave,
  onDirtyChange,
}: QuotationTermsEditorProps) {
  const t = useTranslations("quotation.terms");
  const [terms, setTerms] = useState<string[]>(version.terms);

  const trimmed = terms.map((term) => term.trim());
  const blank = trimmed.some((term) => term.length === 0);
  const tooLong = trimmed.some((term) => term.length > TERM_MAX);
  const dirty =
    trimmed.length !== version.terms.length ||
    trimmed.some((term, index) => term !== version.terms[index]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const change = (index: number, value: string) =>
    setTerms((previous) =>
      previous.map((term, at) => (at === index ? value : term)),
    );

  return (
    <DetailSection
      title={t("title")}
      action={
        editable ? (
          <DetailPanelActionButton
            variant="primary"
            label={t("save")}
            disabled={!dirty || blank || tooLong || saving}
            onClick={() => onSave(trimmed)}
          />
        ) : null
      }
    >
      {editable ? (
        <div className="flex flex-col gap-2">
          {terms.map((term, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="w-6 shrink-0 pt-2 text-right text-sm text-text-secondary">
                {`${index + 1}.`}
              </span>
              <FormTextArea
                className="flex-1"
                label={t("termN", { n: index + 1 })}
                labelHidden
                aria-label={t("termN", { n: index + 1 })}
                rows={2}
                value={term}
                maxLength={TERM_MAX}
                error={
                  term.trim().length === 0 ? t("validation.blank") : undefined
                }
                onChange={(event) => change(index, event.target.value)}
              />
              <DetailPanelActionButton
                iconOnly
                icon="trash"
                variant="danger"
                aria-label={t("remove", { n: index + 1 })}
                title={t("remove", { n: index + 1 })}
                onClick={() =>
                  setTerms((previous) =>
                    previous.filter((_, at) => at !== index),
                  )
                }
              />
            </div>
          ))}
          <div>
            <DetailPanelActionButton
              icon="plus"
              label={t("add")}
              disabled={terms.length >= TERMS_MAX_COUNT}
              onClick={() => setTerms((previous) => [...previous, ""])}
            />
          </div>
        </div>
      ) : (
        <TermsList terms={version.terms} />
      )}
    </DetailSection>
  );
}

function TermsList({ terms }: { terms: string[] }) {
  const t = useTranslations("quotation.terms");
  if (terms.length === 0) {
    return <p className="text-sm text-text-secondary">{t("empty")}</p>;
  }
  return (
    <ol className="list-decimal pl-6 text-sm text-text-primary">
      {terms.map((term, index) => (
        <li key={index}>{term}</li>
      ))}
    </ol>
  );
}

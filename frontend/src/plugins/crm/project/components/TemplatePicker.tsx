"use client";

import { useTranslations } from "next-intl";
import React, { useMemo } from "react";

import { FormSelect } from "@/kernel/core/components/ui/FormSelect";

import type { QuotationTemplate } from "@plugins/sales/template/types";

interface TemplatePickerProps {
  /** Active templates only; the caller fetches them. */
  templates: QuotationTemplate[];
  /** Template id as the form holds it; empty means no template. */
  value: string;
  onChange: (value: string) => void;
  /** The template the project already has, kept selectable after it left the active list. */
  current?: { id: number; name?: string | null };
}

/** Picks the quotation template of a project from the active ones, or none. */
export function TemplatePicker({
  templates,
  value,
  onChange,
  current,
}: TemplatePickerProps) {
  const t = useTranslations("project");

  const options = useMemo(() => {
    const list = [
      { value: "", label: t("quotationTemplateNone") },
      ...templates.map((template) => ({
        value: String(template.id),
        label: `${template.code} — ${template.name}`,
      })),
    ];
    // A template switched off or deleted since still describes the project, so it stays shown.
    if (current && !templates.some((template) => template.id === current.id)) {
      list.push({
        value: String(current.id),
        label: current.name ?? String(current.id),
      });
    }
    return list;
  }, [templates, current, t]);

  return (
    <FormSelect
      label={t("quotationTemplate")}
      span2
      searchable={false}
      allowClear={false}
      options={options}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

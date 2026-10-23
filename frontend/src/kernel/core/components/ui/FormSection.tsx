"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

interface FormSectionProps {
  /** A node, not just text, so a section whose content is required can carry the marker. */
  title: React.ReactNode;
  icon?: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
  optionalLabel?: string;
  /** Controls at the right end of the title row. A line table's add button is not one: it sits under the rows. */
  actions?: React.ReactNode;
}

/**
 * Titled block that groups related form fields. The form counterpart of `DetailSection`.
 *
 * Lives in the kernel because it carries no domain: every plugin's form uses the same heading
 * rule. It was previously exported from the product feature as `ProductFormBlock`, which made two
 * sales screens import a master-data module for a border and an icon.
 */
export function FormSection({
  title,
  icon,
  children,
  className,
  optional = false,
  optionalLabel = "Optional",
  actions,
}: FormSectionProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="mb-1 flex items-center gap-2 border-b border-border-secondary pb-1.5 text-sm font-bold text-brand">
        {icon ? <Icon name={icon} size={16} className="text-brand" /> : null}
        <span>{title}</span>
        {optional ? (
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
            ({optionalLabel})
          </span>
        ) : null}
        {actions ? (
          <div className="ml-auto flex items-center gap-2 font-normal">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

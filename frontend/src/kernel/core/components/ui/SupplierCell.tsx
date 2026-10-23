import type { SupplierLabelInput } from "@kernel/core/lib/supplier-label";

/** Detail line-table supplier cell: short name (fallback legal name) over the small code. */
export function SupplierCell({ code, shortName, name }: SupplierLabelInput) {
  const display = shortName || name || code;
  if (!display) return <>—</>;
  return (
    <div className="flex flex-col">
      <span className="font-semibold text-text-primary" title={name || ""}>
        {display}
      </span>
      {code && display !== code && (
        <span className="font-mono text-[11px] text-text-tertiary">{code}</span>
      )}
    </div>
  );
}

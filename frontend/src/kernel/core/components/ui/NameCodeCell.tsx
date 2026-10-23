import { cn } from "@kernel/core/lib/cn";

export interface NameCodeCellProps {
  name?: string | null;
  code?: string | null;
  /** Classes of the name line, e.g. `font-bold` for a party's short name. */
  nameClassName?: string;
}

/**
 * List cell as the mock draws a named reference: the name on top, its code beneath in the
 * small 10px `.rn` face (semi-bold, normal colour). With no name and no code it reads "—".
 */
export function NameCodeCell({
  name,
  code,
  nameClassName,
}: Readonly<NameCodeCellProps>) {
  const top = name || code;
  if (!top) return <>—</>;
  return (
    <div className="flex flex-col gap-[2px]">
      <span className={cn("text-text-primary", nameClassName)}>{top}</span>
      {name && code ? (
        <span className="text-[10px] font-semibold text-text-primary">
          {code}
        </span>
      ) : null}
    </div>
  );
}

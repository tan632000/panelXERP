export interface CodeNameCellProps {
  code?: string | null;
  name?: string | null;
  /** Classes of the name line; defaults to the muted body size. */
  nameClassName?: string;
}

/** List cell as the mock draws a product: the code on top, its name beneath in the muted tone. */
export function CodeNameCell({
  code,
  name,
  nameClassName = "text-text-secondary",
}: Readonly<CodeNameCellProps>) {
  if (!code && !name) return <>—</>;
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-text-primary">{code || name}</span>
      {code && name ? <span className={nameClassName}>{name}</span> : null}
    </div>
  );
}

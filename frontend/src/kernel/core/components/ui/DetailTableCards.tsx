"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useRef } from "react";

import { TableMobileCards } from "@/kernel/core/components/ui/table-mobile-cards-context";
import { ICON_CARD_LABEL_KEYS } from "@/kernel/core/components/ui/TableMobileCardList";
import { useCardTableLabels } from "@/kernel/core/hooks/useCardTableLabels";
import { usePhoneViewport } from "@/kernel/core/hooks/usePhoneViewport";

/**
 * Draws a detail screen's line tables as cards on a phone or a tablet, as its list does.
 *
 * Kernel `Table`s below turn into `TableMobileCardList` cards; hand-built `<table>`s are
 * captioned cell by cell (`labelCardTables`) and restyled as cards by `[data-detail-cards]`
 * in `globals.css`. A table that must stay a table carries `data-no-cards`. Tables in a modal
 * are untouched: a modal renders outside this subtree.
 */
export function DetailTableCards({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("common");
  const isPhone = usePhoneViewport();
  const rootRef = useRef<HTMLDivElement>(null);

  const shortActionLabel = useCallback(
    (button: Element) => {
      const iconClass = [
        ...(button.querySelector("svg")?.classList ?? []),
      ].find((name) => name in ICON_CARD_LABEL_KEYS);
      return iconClass ? t(ICON_CARD_LABEL_KEYS[iconClass]) : undefined;
    },
    [t],
  );

  useCardTableLabels(rootRef, isPhone, shortActionLabel);

  return (
    <TableMobileCards>
      <div ref={rootRef} data-detail-cards={isPhone ? "" : undefined}>
        {children}
      </div>
    </TableMobileCards>
  );
}

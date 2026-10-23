"use client";

import React, { createContext, useContext } from "react";

import { ModalScopeContext } from "@/kernel/core/components/ui/modal-scope-context";
import { usePhoneViewport } from "@/kernel/core/hooks/usePhoneViewport";

/**
 * True inside a module whose lists show phone users cards instead of table rows.
 *
 * Opt-in per module: a card names every field with its column header, which reads well for a
 * list of records but not for every table a module draws, so each module turns it on once
 * its screens have been checked on a phone.
 */
export const TableMobileCardsContext = createContext(false);

/** Turns on phone cards for every `Table` below it. Usable from a server layout. */
export function TableMobileCards({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <TableMobileCardsContext.Provider value>
      {children}
    </TableMobileCardsContext.Provider>
  );
}

/**
 * Whether a list should draw cards right now: its module opted in, the screen is a phone or a
 * tablet, and it is not inside a modal. The kernel `Table` asks this; a hand-built list table
 * asks it too, to swap its `<table>` for `TableMobileCardList`.
 */
export function useShowTableMobileCards(): boolean {
  const optedIn = useContext(TableMobileCardsContext);
  const isPhone = usePhoneViewport();
  const isInModal = useContext(ModalScopeContext);
  return optedIn && isPhone && !isInModal;
}

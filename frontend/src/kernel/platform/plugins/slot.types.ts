import type { ComponentType } from "react";

/**
 * Name of a place in a host screen where another plugin may render.
 *
 * The host owns the name and the context shape it passes; a contributor renders only from that
 * context. Names read host-first — `"order.form.afterLines"`, not `"product.technicalPanel"` —
 * because the host is what stays put when contributors come and go.
 */
export type SlotName = string;

export interface SlotContribution<TContext = void> {
  /** Slot this renders into: the host's name, never the contributor's own. */
  slot: SlotName;
  /**
   * Identity within the slot, unique across every plugin contributing to it. Used as the React
   * key and as the tie-break that keeps ordering stable.
   */
  id: string;
  /** Ascending. Equal values fall back to `id`, so the order never depends on plugin order. */
  order?: number;
  Component: ComponentType<TContext>;
}

/**
 * A contribution held by the registry, where the context type is no longer known.
 *
 * `never` rather than `unknown`: a `ComponentType<TContext>` is assignable to
 * `ComponentType<never>` for any `TContext`, so contributions of different context shapes can sit
 * in one list. `PluginSlot` restores the host's type at the point of render.
 */
export type AnySlotContribution = SlotContribution<never>;

import { ENABLED_FRONTEND_PLUGINS } from "@kernel/platform/plugins/enabled-plugins";

import type { ErpFrontendPlugin } from "@kernel/platform/plugins/plugin.contract";
import type {
  AnySlotContribution,
  SlotName,
} from "@kernel/platform/plugins/slot.types";

/**
 * Groups every enabled plugin's slot contributions by slot name.
 *
 * Exported separately from the resolved constant so it can be tested without touching the env,
 * the same split `resolve-enabled-plugins` uses.
 */
export function groupContributionsBySlot(
  plugins: readonly ErpFrontendPlugin[],
): Record<SlotName, AnySlotContribution[]> {
  const bySlot: Record<SlotName, AnySlotContribution[]> = {};

  for (const plugin of plugins) {
    for (const contribution of plugin.slots ?? []) {
      const existing = bySlot[contribution.slot] ?? [];

      if (existing.some((item) => item.id === contribution.id)) {
        throw new Error(
          `Duplicate slot contribution "${contribution.id}" for slot "${contribution.slot}" (plugin "${plugin.key}")`,
        );
      }

      existing.push(contribution);
      bySlot[contribution.slot] = existing;
    }
  }

  // Sorted once here, so a render never depends on plugin registration order.
  for (const contributions of Object.values(bySlot)) {
    contributions.sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
  }

  return bySlot;
}

export const slotRegistry: Record<SlotName, AnySlotContribution[]> =
  groupContributionsBySlot(ENABLED_FRONTEND_PLUGINS);

/**
 * Contributions for one slot, in render order. Empty when no enabled plugin contributes — which
 * is the normal case for a host whose contributor is switched off.
 */
export function getSlotContributions(
  name: SlotName,
): readonly AnySlotContribution[] {
  return slotRegistry[name] ?? [];
}

/** Lets a host drop its own heading or card when nothing would render inside it. */
export function hasSlotContributions(name: SlotName): boolean {
  return getSlotContributions(name).length > 0;
}

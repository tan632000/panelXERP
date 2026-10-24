/** Catalog groups an item belongs to; the API and the column store these English values. */
export const ITEM_GROUPS = [
  'enclosure',
  'breaker',
  'contactor',
  'relay',
  'plc',
  'inverter',
  'cable',
  'terminal',
  'accessory',
  'other',
] as const;

export type ItemGroup = (typeof ITEM_GROUPS)[number];

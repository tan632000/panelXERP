/**
 * Lists that may store a per-user column choice.
 *
 * A closed registry rather than a free-text key: without it any string would create rows
 * nobody ever reads, and a typo in one screen would silently lose that screen's preference.
 */
export const LIST_PREFERENCE_MODULE_KEYS = [
  'user_list_v2',
  'role_list_v2',
  'customer_list_v2',
  // Not a list: the functions the account pinned to the top of the sidebar, stored as their
  // routes in `visible_columns` so a pin follows the account to every device.
  'sidebar_pins',
] as const;

export type ListPreferenceModuleKey =
  (typeof LIST_PREFERENCE_MODULE_KEYS)[number];

export function isListPreferenceModuleKey(
  value: string,
): value is ListPreferenceModuleKey {
  return (LIST_PREFERENCE_MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Width-only key of a picker dialog: `picker_` + a base-36 hash of its column keys. Pickers
 * are identified by their column set rather than registered one by one — there are over a
 * hundred, reused across screens — so the shape is checked instead of a list.
 */
const PICKER_COLUMN_WIDTH_KEY = /^picker_[0-9a-z]{1,13}$/;

export function isPickerColumnWidthKey(value: string): boolean {
  return PICKER_COLUMN_WIDTH_KEY.test(value);
}

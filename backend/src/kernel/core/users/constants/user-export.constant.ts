/** Key the account list registers its Excel export source under. */
export const USER_EXPORT_SOURCE = 'users';

/**
 * Flat row fields an Excel export of the account list may write — the text columns of the
 * table. The picture and signature columns, and every credential, are deliberately absent, so
 * a client cannot ask for them. Department arrives as the stored English key; the sheet spec
 * carries the reader's label map.
 */
export const USER_EXPORT_FIELDS = [
  'username',
  'fullName',
  'email',
  'roleName',
  'department',
  'phone',
  'title',
  'isActive',
  'lastLoginAt',
] as const;

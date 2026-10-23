/**
 * The departments an account belongs to, picked from a fixed list rather than typed. Values
 * are English camelCase; the labels live in the frontend i18n bundles.
 */
export const USER_DEPARTMENTS = [
  'sales',
  'planning',
  'purchasing',
  'technical',
  'qcLab',
  'warehouse',
  'accounting',
  'other',
] as const;

export type UserDepartment = (typeof USER_DEPARTMENTS)[number];

export const USER_DEPARTMENT_INVALID_MESSAGE = `Department must be one of: ${USER_DEPARTMENTS.join(', ')}`;

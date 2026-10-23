/**
 * The departments an account belongs to, mirroring the backend's `USER_DEPARTMENTS`. The
 * stored value is the English key; the label comes from `common.userDepartments`.
 */
export const USER_DEPARTMENTS = [
  "sales",
  "planning",
  "purchasing",
  "technical",
  "qcLab",
  "warehouse",
  "mechanical",
  "surfaceTreatment",
  "packaging",
  "accounting",
  "other",
] as const;

export type UserDepartment = (typeof USER_DEPARTMENTS)[number];

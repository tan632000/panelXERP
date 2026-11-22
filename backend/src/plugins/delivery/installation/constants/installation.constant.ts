export const SITE_ADDRESS_MAX = 500;
export const PERSON_IN_CHARGE_MAX = 255;
export const INSTALLATION_NOTE_MAX = 2000;

/** `planned → in_progress → done`, forward only; an installation is never cancelled. */
export enum InstallationStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

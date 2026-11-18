export const STOREKEEPER_ROLE = 'storekeeper';

export const QC_UNIT_FAILED_EVENT = 'qc.unit.failed';
export const QC_UNIT_PASSED_EVENT = 'qc.unit.passed';

export const QC_NOTE_MAX = 1000;

export const QC_ROUND_PASSED = 'passed';
export const QC_ROUND_FAILED = 'failed';

export enum QcItemResult {
  PASS = 'pass',
  FAIL = 'fail',
  NA = 'na',
}

export enum QcDefectStatus {
  OPEN = 'open',
  FIXED = 'fixed',
  VERIFIED = 'verified',
}

/** What a cabinet's QC looks like from delivery's own tables. */
export enum QcUnitStatus {
  NOT_READY = 'not_ready',
  WAITING = 'waiting',
  FAILED = 'failed',
  PASSED = 'passed',
}

/** Production order statuses in which a finished cabinet may be inspected. */
export const QC_READY_PRODUCTION_STATUSES: readonly string[] = [
  'released',
  'completed',
];

/** Name the QC guards register under on the production guard registry. */
export const QC_GUARD_NAME = 'qc-inspection';

export const PRODUCTION_PROGRESS_READ = 'production_progress:read' as const;
/** Start and finish a stage of a cabinet. */
export const PRODUCTION_PROGRESS_UPDATE = 'production_progress:update' as const;
/** Take the latest finished stage of a cabinet back, with a reason. */
export const PRODUCTION_PROGRESS_UNDO = 'production_progress:undo' as const;

export const progressPermissions = [
  PRODUCTION_PROGRESS_READ,
  PRODUCTION_PROGRESS_UPDATE,
  PRODUCTION_PROGRESS_UNDO,
] as const;

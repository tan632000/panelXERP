export const STOCKTAKE_TABLE = 'stocktakes';
export const STOCKTAKE_CODE_PREFIX = 'KK';
export const STOCKTAKE_CODE_INDEX = 'uq_stocktakes_code';
/** At most one count is open (counting or submitted) at a time (D-14). */
export const STOCKTAKE_OPEN_INDEX = 'uq_stocktakes_open';
export const STOCKTAKE_LABEL = 'Stock count';
/** The document kind its stock movements carry. */
export const STOCKTAKE_DOCUMENT_TYPE = 'stocktake';

/** Name the count registers under at the catalog's item delete veto. */
export const STOCKTAKE_REFERENCE_CHECK = 'inventory-stocktake';

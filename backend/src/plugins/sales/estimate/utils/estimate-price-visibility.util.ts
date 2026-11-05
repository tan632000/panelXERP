import { canReadReferencePrice } from '@plugins/catalog/item/utils/item-price-visibility.util';

import type { AuthUserPayload } from '@kernel/core/auth/decorators/auth.decorators';
import type {
  EstimatePanelView,
  EstimateRevisionView,
} from '@plugins/sales/estimate/utils/estimate-revision.util';

// The functions below keep the declared type of what they are given: the keys are removed at
// runtime, and the in-process readers of the estimate never pass through here.

function withoutPanelMoney(panel: EstimatePanelView): EstimatePanelView {
  const {
    unitCost: _cost,
    total: _total,
    costLines: _costLines,
    bomLines,
    ...rest
  } = panel;
  return {
    ...rest,
    bomLines: bomLines.map(
      ({ unitCost: _unitCost, amount: _amount, ...line }) => line,
    ),
  } as EstimatePanelView;
}

/**
 * The revision as the actor may see it. Every price key is dropped, not nulled, and so are the
 * cost lines, which hold nothing but prices: an engineer must not learn that a price exists.
 */
export function presentRevision(
  view: EstimateRevisionView,
  actor: AuthUserPayload,
): EstimateRevisionView {
  if (canReadReferencePrice(actor)) return view;
  const { total: _total, panels, ...rest } = view;
  return {
    ...rest,
    panels: panels.map(withoutPanelMoney),
  } as EstimateRevisionView;
}

/** An estimate detail (header, revision list and the revision asked for) as the actor may see it. */
export function presentEstimate<
  T extends {
    total: number;
    revisions: Array<{ total: number }>;
    current: EstimateRevisionView;
  },
>(detail: T, actor: AuthUserPayload): T {
  if (canReadReferencePrice(actor)) return detail;
  const { total: _total, revisions, current, ...rest } = detail;
  return {
    ...rest,
    revisions: revisions.map(
      ({ total: _revisionTotal, ...revision }) => revision,
    ),
    current: presentRevision(current, actor),
  } as unknown as T;
}

/** A page of estimates as the actor may see it. */
export function presentEstimatePage<
  T extends { total: number },
  P extends { data: T[] },
>(page: P, actor: AuthUserPayload): P {
  if (canReadReferencePrice(actor)) return page;
  return {
    ...page,
    data: page.data.map(({ total: _total, ...row }) => row),
  };
}

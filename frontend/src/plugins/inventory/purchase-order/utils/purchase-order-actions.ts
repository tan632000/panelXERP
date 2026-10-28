import {
  PURCHASE_ORDER_CANCELLABLE,
  PURCHASE_ORDER_CLOSABLE,
} from "@plugins/inventory/purchase-order/constants";
import { PurchaseOrderPermission } from "@plugins/inventory/purchase-order/permissions/purchase-order-permission.keys";

import type { PurchaseOrderDetail } from "@plugins/inventory/purchase-order/types";

export interface PurchaseOrderActions {
  edit: boolean;
  submit: boolean;
  /** Approve and reject go together: both are the director's decision. */
  decide: boolean;
  /** The reader could decide but took part in the order, so the server would refuse them. */
  decideBarred: boolean;
  cancel: boolean;
  close: boolean;
}

/**
 * What the reader may do with the order now. Mirrors the server's rules so a control the
 * server would refuse is not offered; the server still decides.
 */
export function purchaseOrderActions(
  order: Pick<
    PurchaseOrderDetail,
    "status" | "createdBy" | "submittedBy" | "editorIds" | "lines" | "events"
  > &
    Partial<Pick<PurchaseOrderDetail, "total">>,
  can: (permission: string) => boolean,
  userId: number | undefined,
): PurchaseOrderActions {
  // A rejection clears `submittedBy`; whoever submitted before stays barred through the history.
  const involved =
    userId !== undefined &&
    (order.createdBy === userId ||
      order.submittedBy === userId ||
      order.editorIds.includes(userId) ||
      order.events.some(
        (event) => event.event === "submitted" && event.actorId === userId,
      ));
  const mayDecide =
    order.status === "pending_approval" && can(PurchaseOrderPermission.approve);
  const received = order.lines.some((line) => line.receivedQty > 0);

  return {
    // Editing rewrites every price, so only a reader the API showed the prices to may edit.
    edit:
      order.status === "draft" &&
      "total" in order &&
      can(PurchaseOrderPermission.update),
    submit:
      order.status === "draft" &&
      order.lines.length > 0 &&
      can(PurchaseOrderPermission.submit),
    decide: mayDecide && !involved,
    decideBarred: mayDecide && involved,
    cancel:
      PURCHASE_ORDER_CANCELLABLE.includes(order.status) &&
      !received &&
      can(PurchaseOrderPermission.cancel),
    close:
      PURCHASE_ORDER_CLOSABLE.includes(order.status) &&
      can(PurchaseOrderPermission.close),
  };
}

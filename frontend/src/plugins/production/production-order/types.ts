import type {
  ProductionOrderEventType,
  ProductionOrderStatus,
} from "@plugins/production/production-order/constants";
import type { ProductionStage } from "@plugins/production/progress/constants";

export interface ProductionOrderRow {
  id: number;
  code: string;
  orderId: number;
  orderCode: string;
  status: ProductionOrderStatus;
  customerName: string | null;
  deliveryDate: string | null;
  unitCount: number;
  createdAt: string;
  releasedAt: string | null;
}

export interface ProductionUnit {
  id: number;
  code: string;
  tag: string;
  description: string | null;
  orderLineId: number;
  assigneeId: number | null;
  assigneeName: string | null;
  plannedEndDate: string | null;
  doneCount: number;
  currentStage: ProductionStage | null;
}

export interface ProductionOrderEvent {
  id: number;
  event: ProductionOrderEventType;
  actorId: number;
  actorName: string | null;
  unitCode: string | null;
  stage: ProductionStage | null;
  severity: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ProductionOrderDetail extends ProductionOrderRow {
  cancelReason: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  units: ProductionUnit[];
  /** Only a production manager or an admin gets the history. */
  events?: ProductionOrderEvent[];
}

/** An item the order still lacks: quantities only. */
export interface ProductionShortItem {
  itemId: number;
  itemCode: string;
  itemName: string;
  itemUnit: string;
  demand: number;
  reserved: number;
  short: number;
}

export interface OpenOrderOption {
  id: number;
  code: string;
  customerName: string;
  deliveryDate: string | null;
}

export interface TechnicianOption {
  id: number;
  name: string;
}

/** A field left out stays as it is on the server. */
export interface UnitUpdateInput {
  assigneeId?: number;
  plannedEndDate?: string;
}

export interface ProductionOrderListParams {
  page?: number;
  limit?: number;
  status?: ProductionOrderStatus;
  orderId?: number;
}

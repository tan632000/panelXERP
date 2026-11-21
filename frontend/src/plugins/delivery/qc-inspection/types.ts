import type {
  QcDefectStatus,
  QcItemResult,
  QcUnitStatus,
} from "@plugins/delivery/qc-inspection/constants";

export interface QcPhoto {
  id: number;
  roundItemId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdBy: number | null;
  createdAt: string;
}

export interface QcRoundItem {
  id: number;
  checklistItemId: number;
  name: string;
  position: number;
  result: QcItemResult;
  note: string | null;
  photos: QcPhoto[];
}

export interface QcRound {
  id: number;
  roundNo: number;
  result: "passed" | "failed";
  inspectedAt: string;
  inspectorId: number;
  inspectorName: string | null;
  items: QcRoundItem[];
}

export interface QcDefect {
  id: number;
  unitId: number;
  unitCode: string;
  roundNo: number;
  description: string;
  status: QcDefectStatus;
  fixNote: string | null;
  fixedBy: number | null;
  fixedByName: string | null;
  fixedAt: string | null;
  verifiedBy: number | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
}

export interface QcUnitSummary {
  unitId: number;
  code: string;
  tag: string;
  description: string | null;
  productionOrderId: number;
  productionOrderCode: string;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  qcStatus: QcUnitStatus;
}

export interface QcUnitDetail extends QcUnitSummary {
  rounds: QcRound[];
  defects: QcDefect[];
}

export interface QcUnitListParams {
  qcStatus?: QcUnitStatus;
  orderId?: number;
  page?: number;
  limit?: number;
}

export interface QcDefectListParams {
  status?: QcDefectStatus;
  unitId?: number;
  page?: number;
  limit?: number;
}

export interface QcRoundInput {
  results: Array<{
    checklistItemId: number;
    result: QcItemResult;
    note?: string;
  }>;
}

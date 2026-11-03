import type { ProductionOrderStatus } from "@plugins/production/production-order/constants";
import type {
  ProductionStage,
  StageStatus,
} from "@plugins/production/progress/constants";

export interface StageProgress {
  stage: ProductionStage;
  seq: number;
  status: StageStatus;
  startedAt: string | null;
  startedByName: string | null;
  doneAt: string | null;
  doneByName: string | null;
}

export interface UnitProgress {
  id: number;
  code: string;
  tag: string;
  description: string | null;
  productionOrderId: number;
  productionOrderCode: string;
  productionOrderStatus: ProductionOrderStatus;
  assigneeId: number | null;
  assigneeName: string | null;
  plannedEndDate: string | null;
  stages: StageProgress[];
  doneCount: number;
  currentStage: ProductionStage | null;
}

export interface UnitListParams {
  page?: number;
  limit?: number;
  mine?: boolean;
  productionOrderId?: number;
  stageStatus?: StageStatus;
}

export interface UnitPhoto {
  id: number;
  unitId: number;
  stage: ProductionStage;
  issueId: number | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface PhotoUploadInput {
  file: File;
  stage: ProductionStage;
  issueId?: number;
}

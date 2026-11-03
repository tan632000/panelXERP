import type {
  IssueSeverity,
  IssueStatus,
} from "@plugins/production/production-issue/constants";
import type { ProductionStage } from "@plugins/production/progress/constants";

export interface ProductionIssue {
  id: number;
  unitId: number;
  unitCode: string;
  productionOrderId: number;
  productionOrderCode: string;
  stage: ProductionStage;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  reportedBy: number;
  reportedByName: string | null;
  createdAt: string;
  resolvedBy: number | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface IssueListParams {
  page?: number;
  limit?: number;
  status?: IssueStatus;
  productionOrderId?: number;
  unitId?: number;
}

export interface OpenIssueInput {
  stage: ProductionStage;
  description: string;
  severity: IssueSeverity;
}

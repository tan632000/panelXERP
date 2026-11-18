export interface QcChecklistItem {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

export interface UpdateQcChecklistItemInput {
  name?: string;
  active?: boolean;
}

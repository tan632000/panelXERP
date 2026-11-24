/** A template row of the list. Templates carry no price anywhere. */
export interface QuotationTemplate {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateLine {
  id?: number;
  itemId: number;
  quantity: number;
  groupLabel?: string | null;
  note?: string | null;
  /** Catalog columns the detail reads live; absent from what the form sends. */
  itemCode?: string | null;
  itemName?: string | null;
  itemBrand?: string | null;
  itemUnit?: string | null;
}

export interface TemplatePanel {
  id?: number;
  tag: string;
  description?: string | null;
  quantity: number;
  lines: TemplateLine[];
}

export interface QuotationTemplateDetail extends QuotationTemplate {
  panels: TemplatePanel[];
}

export interface TemplateListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface TemplateLineDto {
  itemId: number;
  quantity: number;
  groupLabel?: string | null;
  note?: string | null;
}

export interface TemplatePanelDto {
  tag: string;
  description?: string | null;
  quantity: number;
  lines: TemplateLineDto[];
}

export interface CreateTemplateDto {
  code: string;
  name: string;
  description?: string | null;
  panels: TemplatePanelDto[];
}

/** The code is fixed once created, so an update never carries it. */
export type UpdateTemplateDto = Partial<Omit<CreateTemplateDto, "code">>;

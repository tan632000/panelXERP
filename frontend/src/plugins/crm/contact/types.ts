export interface Contact {
  id: number;
  customerId: number;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateContactDto {
  customerId: number;
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export type UpdateContactDto = Partial<Omit<CreateContactDto, "customerId">>;

export interface AcceptanceFile {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

/** The signed acceptance minutes of an order. The server sends no storage key. */
export interface AcceptanceView {
  id: number;
  orderId: number;
  representativeName: string;
  signedDate: string;
  createdAt: string;
  files: AcceptanceFile[];
}

export interface AcceptanceInput {
  representativeName: string;
  signedDate: string;
  files: File[];
}

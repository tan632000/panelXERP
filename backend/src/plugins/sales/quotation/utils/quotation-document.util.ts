import { join } from 'path';

import type { Letterhead } from '@plugins/sales/quotation/config/quotation-letterhead.config';

/** Bundled files the printed quotation needs; the Docker image copies `assets/` next to `dist/`. */
const ASSET_DIR = join(process.cwd(), 'assets');
export const QUOTATION_LOGO_PATH = join(
  ASSET_DIR,
  'branding',
  'company-logo.jpg',
);
export const QUOTATION_FONT_REGULAR = join(
  ASSET_DIR,
  'fonts',
  'BeVietnamPro-Regular.ttf',
);
export const QUOTATION_FONT_BOLD = join(
  ASSET_DIR,
  'fonts',
  'BeVietnamPro-Bold.ttf',
);

export interface QuotationDocumentBom {
  description: string;
  code: string;
  brand: string;
  unit: string;
  quantity: number;
}

export interface QuotationDocumentPanel {
  /** Roman numeral of the section. */
  numeral: string;
  title: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  bomLines: QuotationDocumentBom[];
}

export interface QuotationDocumentParty {
  name: string;
  phone: string;
  email: string;
}

/** Everything a rendered quotation shows, read from the stored version and never recomputed. */
export interface QuotationDocument {
  letterhead: Letterhead;
  /** `NN-ddmmyyyy/BG`. */
  code: string;
  customerName: string;
  /** `dd/mm/yyyy`, Vietnam date. */
  quotedOn: string;
  /** The place and date line above the order confirmation. */
  placeAndDate: string;
  recipient: QuotationDocumentParty;
  sender: QuotationDocumentParty;
  panels: QuotationDocumentPanel[];
  subtotal: number;
  discountAmount: number;
  /** The discount row label: carries the percent when the discount is one. */
  discountLabel: string;
  vatRate: number;
  vatAmount: number;
  total: number;
  terms: string[];
}

export const TABLE_HEADERS = [
  'STT',
  'MÔ TẢ',
  'MÃ HÀNG',
  'HÃNG SẢN XUẤT',
  'ĐV TÍNH',
  'SỐ LƯỢNG',
  'Đơn giá (VNĐ)',
  'Thành tiền (VNĐ)',
] as const;

/** The two lines under the parties block; the first names the company from the letterhead. */
export function greetingLines(companyName: string): [string, string] {
  return [
    `${companyName} trân trọng cảm ơn sự quan tâm, hợp tác của Quý Công ty.`,
    'Công ty chúng tôi xin gửi bảng báo giá, chi tiết như sau:',
  ];
}

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(value: number): string {
  let rest = value;
  let out = '';
  for (const [size, symbol] of ROMAN) {
    while (rest >= size) {
      out += symbol;
      rest -= size;
    }
  }
  return out;
}

/** Day, month and year of an instant on the Vietnam calendar, two-digit day and month. */
export function vietnamDateParts(at: Date): {
  dd: string;
  mm: string;
  yyyy: string;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at);
  const of = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return { dd: of('day'), mm: of('month'), yyyy: of('year') };
}

/** The file name a download carries: the code with its slash made safe. */
export function exportFileName(code: string, extension: string): string {
  return `${code.replace(/[^A-Za-z0-9-]+/g, '-')}.${extension}`;
}

/** Whole VND with thousands separators, as the PDF prints them. */
export function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(
    value,
  );
}

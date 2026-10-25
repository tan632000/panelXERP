import { DEFAULT_LETTERHEAD } from '@plugins/sales/quotation/config/quotation-letterhead.config';
import { renderQuotationPdf } from '@plugins/sales/quotation/utils/quotation-pdf.render';

import type { QuotationDocument } from '@plugins/sales/quotation/utils/quotation-document.util';

/** The printable bottom of the A4 page: height 841.89pt less the 30pt margin. */
const PAGE_BOTTOM = 841.89 - 30;

/** One panel whose BOM descriptions run from one line to many, so some land at a page break. */
function longDocument(): QuotationDocument {
  return {
    letterhead: {
      ...DEFAULT_LETTERHEAD,
      bankAccounts: [...DEFAULT_LETTERHEAD.bankAccounts],
    },
    code: '01-25102026/BG',
    customerName: 'Customer',
    quotedOn: '25/10/2026',
    placeAndDate: 'Hà Nội, Ngày 25 tháng 10 năm 2026',
    recipient: { name: '', phone: '', email: '' },
    sender: { name: '', phone: '', email: '' },
    panels: [
      {
        numeral: 'I',
        title: 'MSB-01',
        quantity: 1,
        unitPrice: 1000,
        amount: 1000,
        bomLines: Array.from({ length: 40 }, (_, index) => ({
          description: 'Vỏ tủ điện trong nhà sơn tĩnh điện '.repeat(
            1 + ((index * 7) % 13),
          ),
          code: `C-${index}`,
          brand: 'FUJI',
          unit: 'Cái',
          quantity: 1,
        })),
      },
    ],
    subtotal: 1000,
    discountAmount: 0,
    discountLabel: 'Chiết khấu',
    vatRate: 8,
    vatAmount: 80,
    total: 1080,
    terms: ['Term'],
  };
}

describe('renderQuotationPdf', () => {
  it('measures every row from its text, so no border runs past the page bottom', async () => {
    // Uncompressed, the `x y w h re` rectangles of the cell borders can be read back.
    const body = (
      await renderQuotationPdf(longDocument(), { compress: false })
    ).toString('latin1');

    const rects = [
      ...body.matchAll(/(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+) re\b/g),
    ].map(([, , y, , h]) => Number(y) + Number(h));
    expect(rects.length).toBeGreaterThan(100);
    expect(Math.max(...rects)).toBeLessThanOrEqual(PAGE_BOTTOM + 0.01);
    expect(body.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  });
});

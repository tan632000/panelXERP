import {
  matchesReceiptLineQr,
  parseReceiptLineQr,
  receiptLineQrPath,
} from '@shared/utils/receipt-line-qr.util';

describe('receipt-line QR', () => {
  it('builds the path the frontend prints, line numbers 1-based', () => {
    expect(
      receiptLineQrPath('rawMaterial', 'PNK-NVL-2026-0002', 'VT_0007', 0),
    ).toBe(
      '/warehouse/raw-material/by-no/PNK-NVL-2026-0002?code=VT_0007&line=1',
    );
    expect(receiptLineQrPath('xlbm', 'PNK HC/1', 'HC 42', 2)).toBe(
      '/warehouse/xlbm/by-no/PNK%20HC%2F1?code=HC%2042&line=3',
    );
  });

  it('addresses the BTP lot by its by-no page', () => {
    expect(
      matchesReceiptLineQr(
        'semiFinished',
        'https://erp.vn/warehouse/semi-finished/by-no/PNK-BTP-01?code=LOT-1&line=1',
        { receiptNo: 'pnk-btp-01', itemCode: 'LOT-1', lineIndex: 0 },
      ),
    ).toBe(true);
  });

  it('reads the printed link back whatever its origin', () => {
    expect(
      parseReceiptLineQr(
        'rawMaterial',
        ' https://erp.example.vn/warehouse/raw-material/by-no/PNK-NVL-2026-0002?code=VT_0007&line=2\r\n',
      ),
    ).toEqual({
      receiptNo: 'PNK-NVL-2026-0002',
      itemCode: 'VT_0007',
      lineIndex: 1,
    });
    expect(
      parseReceiptLineQr('xlbm', '/warehouse/xlbm/by-no/PNK%20HC%2F1'),
    ).toEqual({ receiptNo: 'PNK HC/1', itemCode: null, lineIndex: null });
  });

  it("refuses another warehouse's link, plain text and broken links", () => {
    const nvl = receiptLineQrPath('rawMaterial', 'PNK-1', 'VT', 0);
    expect(parseReceiptLineQr('xlbm', nvl)).toBeNull();
    expect(
      parseReceiptLineQr('rawMaterial', 'PNK-1|VT|5kg|W02/2026'),
    ).toBeNull();
    expect(
      parseReceiptLineQr(
        'rawMaterial',
        '/warehouse/raw-material/by-no/%E0%A4%A',
      ),
    ).toBeNull();
  });

  it('matches exactly one line: receipt, line number and the printed code', () => {
    const line = { receiptNo: 'PNK-1', itemCode: 'VT_1', lineIndex: 1 };
    const qr = receiptLineQrPath('rawMaterial', 'PNK-1', 'VT_1', 1);
    expect(matchesReceiptLineQr('rawMaterial', `https://x${qr}`, line)).toBe(
      true,
    );
    expect(
      matchesReceiptLineQr(
        'rawMaterial',
        receiptLineQrPath('rawMaterial', 'PNK-1', 'VT_1', 0),
        line,
      ),
    ).toBe(false);
    expect(
      matchesReceiptLineQr(
        'rawMaterial',
        receiptLineQrPath('rawMaterial', 'PNK-1', 'VT_2', 1),
        line,
      ),
    ).toBe(false);
    expect(
      matchesReceiptLineQr(
        'rawMaterial',
        receiptLineQrPath('rawMaterial', 'PNK-11', 'VT_1', 1),
        line,
      ),
    ).toBe(false);
  });
});

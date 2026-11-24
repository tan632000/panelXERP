import ExcelJS from 'exceljs';

import {
  AiInternalError,
  AiNotConfiguredError,
  AiOutputInvalidError,
  AiRateLimitedError,
  AiTimeoutError,
  CatalogTooLargeError,
} from './ai-errors';
import { AnthropicAiClient } from './anthropic-ai.client';
import { readDocuments } from './document-reader';
import { extractEstimateDraft } from './extract-estimate-draft';
import { buildPrefillPrompt } from './prefill-prompt.builder';
import { redactMoney } from './redact-money';

import type { AiClient } from './ai-client.port';

const catalog = [
  { id: 1, code: 'MCCB-100', name: 'MCCB 100A', brand: 'ABB', unit: 'cái' },
  { id: 2, code: 'BUS-01', name: 'Busbar', brand: null, unit: 'm' },
];

const row = (over: Record<string, unknown> = {}) => ({
  where: 'Tủ chính',
  text: 'MCCB 100A',
  code: 'MCCB-100',
  quantity: 2,
  itemId: 1,
  confidence: 0.8,
  note: 'ok',
  ...over,
});
const panel = (over: Record<string, unknown> = {}) => ({
  tag: 'MSB-01',
  description: 'Tủ tổng',
  quantity: 1,
  aiNote: '',
  rows: [row()],
  ...over,
});
const output = (over: Record<string, unknown> = {}) => ({
  requirementsSummary: 'Tủ điện 1 tủ',
  panels: [panel()],
  ...over,
});

const fakeClient = (result: unknown): AiClient => ({
  extract: jest.fn().mockResolvedValue(result),
});
const extract = (result: unknown) =>
  extractEstimateDraft(
    {
      requirements: 'cần tủ',
      attachments: [],
      catalog,
      storage: { getObjectBuffer: jest.fn() },
    },
    fakeClient(result),
  );

describe('extractEstimateDraft — normalisation', () => {
  it('turns one matched row into one line', async () => {
    const { draft } = await extract(output());
    expect(draft.panels).toHaveLength(1);
    expect(draft.panels[0].lines).toEqual([
      { itemId: 1, quantity: 2, confidence: 0.8, note: 'ok' },
    ]);
    expect(draft.unmatched).toEqual([]);
    expect(draft.requirementsSummary).toBe('Tủ điện 1 tủ');
  });

  it('groups the rows of one item into a single line and sums their quantities itself', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel({
            rows: [
              row({ where: 'quạt hút', quantity: 1, note: '' }),
              row({ where: 'van xoay', quantity: 4, note: '' }),
              row({ where: 'bơm nước', quantity: 2, note: '' }),
              row({ itemId: 2, quantity: 5, note: '' }),
            ],
          }),
        ],
      }),
    );
    const [first, second] = draft.panels[0].lines;
    expect(first.quantity).toBe(7);
    expect(first.note).toBe('Cộng 7 từ: quạt hút 1 + van xoay 4 + bơm nước 2.');
    expect(second).toMatchObject({ itemId: 2, quantity: 5, note: '' });
  });

  it('keeps the sum at the front of a long note so the cut never hides it', async () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({
        where: `nhánh số ${i + 1} của tủ`,
        quantity: 1,
        note: 'ghi chú dài '.repeat(5),
      }),
    );
    const { draft } = await extract(output({ panels: [panel({ rows })] }));
    expect(draft.panels[0].lines[0].quantity).toBe(30);
    expect(draft.panels[0].lines[0].note.startsWith('Cộng 30 từ:')).toBe(true);
  });

  it('trusts the least sure row for the confidence of the whole line', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel({
            rows: [row({ confidence: 0.95 }), row({ confidence: 0.6 })],
          }),
        ],
      }),
    );
    expect(draft.panels[0].lines[0].confidence).toBe(0.6);
  });

  it('keeps decimal sums exact to 3 places', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel({ rows: [row({ quantity: 0.1 }), row({ quantity: 0.2 })] }),
        ],
      }),
    );
    expect(draft.panels[0].lines[0].quantity).toBe(0.3);
  });

  it('sends a row without a match to unmatched with its text, code, quantity and reason', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel({
            rows: [
              row(),
              row({
                itemId: null,
                text: 'Biến tần 30/37 kW',
                code: 'ACE',
                quantity: 1,
                note: 'Khác hãng với danh mục',
              }),
              row({ itemId: null, text: 'Nhân công', code: '', note: '' }),
            ],
          }),
        ],
      }),
    );
    expect(draft.panels[0].lines).toHaveLength(1);
    expect(draft.unmatched).toEqual([
      {
        description: 'Biến tần 30/37 kW (ACE)',
        quantity: 1,
        reason: 'Khác hãng với danh mục',
      },
      {
        description: 'Nhân công',
        quantity: 2,
        reason: 'Không có vật tư tương ứng trong danh mục.',
      },
    ]);
  });

  it('keeps the unmatched rows of a panel that ends up with no line', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel(),
          panel({ tag: 'X', rows: [row({ itemId: null, text: 'Cáp lạ' })] }),
        ],
      }),
    );
    expect(draft.panels.map((p) => p.tag)).toEqual(['MSB-01']);
    expect(draft.unmatched.map((u) => u.description)).toEqual([
      'Cáp lạ (MCCB-100)',
    ]);
  });

  it('drops a row whose itemId is not in the catalog and records a note', async () => {
    const { draft } = await extract(
      output({ panels: [panel({ rows: [row(), row({ itemId: 999 })] })] }),
    );
    expect(draft.panels[0].lines).toHaveLength(1);
    expect(draft.panels[0].aiNote).toContain('999');
  });

  it.each([0, -1, 1_000_001])(
    'drops a matched row with quantity %p',
    async (q) => {
      const { draft } = await extract(
        output({
          panels: [panel({ rows: [row(), row({ itemId: 2, quantity: q })] })],
        }),
      );
      expect(draft.panels[0].lines).toHaveLength(1);
      expect(draft.panels[0].aiNote).not.toBe('');
    },
  );

  it('drops a line whose summed quantity is above the limit', async () => {
    const { draft } = await extract(
      output({
        panels: [
          panel({
            rows: [
              row(),
              row({ itemId: 2, quantity: 600_000 }),
              row({ itemId: 2, quantity: 600_000 }),
            ],
          }),
        ],
      }),
    );
    expect(draft.panels[0].lines.map((l) => l.itemId)).toEqual([1]);
    expect(draft.panels[0].aiNote).toContain('#2');
  });

  it('rejects a non-integer panel quantity', async () => {
    await expect(
      extract(output({ panels: [panel({ quantity: 1.5 })] })),
    ).rejects.toBeInstanceOf(AiOutputInvalidError);
  });

  it('suffixes a duplicate tag case-insensitively', async () => {
    const { draft } = await extract(
      output({ panels: [panel(), panel({ tag: 'msb-01' })] }),
    );
    expect(draft.panels.map((p) => p.tag)).toEqual(['MSB-01', 'msb-01-2']);
  });

  it('drops a panel left with no line', async () => {
    const { draft } = await extract(
      output({
        panels: [panel(), panel({ tag: 'X', rows: [row({ itemId: 999 })] })],
      }),
    );
    expect(draft.panels.map((p) => p.tag)).toEqual(['MSB-01']);
  });

  it('rejects confidence above 1, a row without a quantity, and more than 50 panels', async () => {
    await expect(
      extract(
        output({ panels: [panel({ rows: [row({ confidence: 1.5 })] })] }),
      ),
    ).rejects.toBeInstanceOf(AiOutputInvalidError);
    await expect(
      extract(
        output({ panels: [panel({ rows: [row({ quantity: undefined })] })] }),
      ),
    ).rejects.toBeInstanceOf(AiOutputInvalidError);
    const many = Array.from({ length: 51 }, (_, i) => panel({ tag: `P${i}` }));
    await expect(extract(output({ panels: many }))).rejects.toBeInstanceOf(
      AiOutputInvalidError,
    );
  });

  it('rejects output that is not an object', async () => {
    await expect(extract('nope')).rejects.toBeInstanceOf(AiOutputInvalidError);
  });

  it('truncates long strings and caps unmatched at 50', async () => {
    const { draft } = await extract(
      output({
        requirementsSummary: 'a'.repeat(3000),
        panels: [
          panel({
            description: 'd'.repeat(900),
            tag: 't'.repeat(80),
            rows: [
              row(),
              ...Array.from({ length: 60 }, () =>
                row({ itemId: null, text: 'x', code: '', note: 'y' }),
              ),
            ],
          }),
        ],
      }),
    );
    expect(draft.requirementsSummary).toHaveLength(2000);
    expect(draft.panels[0].description).toHaveLength(500);
    expect(draft.panels[0].tag).toHaveLength(50);
    expect(draft.unmatched).toHaveLength(50);
  });

  it('keeps a panel whose tag was only a price, naming it by position', async () => {
    const { draft } = await extract(
      output({ panels: [panel({ tag: 'Giá: 85 triệu' })] }),
    );
    expect(draft.panels.map((p) => p.tag)).toEqual(['P1']);
  });

  it('strips money from every free-text field', async () => {
    const { draft } = await extract(
      output({
        requirementsSummary: 'Khách muốn tủ.\nĐơn giá 85.000.000đ',
        panels: [
          panel({
            description: 'Tủ giá $1,200 rẻ',
            aiNote: 'thành tiền: 1.200.000 VND',
            rows: [
              row({ note: 'chốt 85.000.000đ nhé', where: 'giá 85.000.000đ' }),
              row({
                itemId: null,
                text: 'Cáp',
                note: 'tầm 1.200.000 VND',
              }),
            ],
          }),
        ],
      }),
    );
    const text = JSON.stringify(draft);
    expect(text).not.toMatch(/85\.000\.000|1\.200\.000|1,200/);
    expect(draft.requirementsSummary).toBe('Khách muốn tủ.');
  });
});

describe('redactMoney', () => {
  it.each([
    'Đơn giá 85.000.000đ',
    'thành tiền: 1.200.000 VND',
    '$1,200',
    'Tầm 85 triệu',
    'khoảng 1,2 tỷ',
    'chốt 12.5tr nhé',
    'chỉ 85tr',
    'còn 500k',
    'đ85.000',
    'VND1200',
    'USD1,200',
    'USD 1.200',
    '1200 đồng',
    '5 đồng',
    '1.2 billion',
    'Cost 85M',
    'tổng tiền 85 triệu',
    'chi phí khoảng 85tr',
    'don gia 85000',
    'giá 500k',
    'giá: 12000',
    'giá khoảng 85 triệu',
    'Gia 85000',
    '85.000.000d',
    '85.000.000 d',
    'VND: 85.000',
    'EUR 1.200',
    '€1.200',
    '1.200 EUR',
    '500 tệ',
    '¥1200',
    'Gia\u0301 85000',
  ])('leaves no figure of %p', (text) => {
    expect(redactMoney(text)).not.toMatch(/\d/);
  });

  it.each([
    'Tủ 3 pha 400V',
    'Giá đỡ thanh cái 3P',
    'giá trị dòng định mức 100A',
    'giá treo cáp 2 tầng',
    'Cắt 10kA 3P, 100kW',
    '3 đèn báo, 5 trụ',
    'Tủ 800x600x2000',
    'Treo bằng 4 ty ren M10',
    'Điện trở 10k',
    'Điện trở 4.7 k',
    'Tỷ lệ biến áp 22/0.4kV',
    'Tỷ số biến dòng 100/5A',
    'Tuổi thọ cơ khí 10 triệu lần đóng cắt',
    'Tuổi thọ 25 nghìn lần',
    'Cảm biến nhiệt NTC 10k',
    'Icu 36k',
  ])('keeps the technical text %p', (text) => {
    expect(redactMoney(text)).toBe(text);
  });

  it.each([
    'tám mươi lăm triệu đồng',
    'một trăm triệu',
    'Tầm hai tỷ',
    'hai trăm năm mươi nghìn',
  ])('removes the spelled amount %p', (text) => {
    expect(redactMoney(text)).not.toMatch(/triệu|tỷ|nghìn/u);
  });

  it('keeps the dimension in front of a price on the same line', () => {
    expect(redactMoney('Tủ 800x600x2000, 85.000 đ')).toBe('Tủ 800x600x2000,');
  });

  it('stays fast on a hostile string', () => {
    const started = Date.now();
    redactMoney(`${'1 '.repeat(50_000)}x`);
    redactMoney('1,000'.repeat(10_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('readDocuments', () => {
  const att = (fileName: string, key = fileName) => ({
    fileName,
    storageKey: key,
  });
  const storageOf = (files: Record<string, Buffer>) => ({
    getObjectBuffer: jest.fn((key: string) => {
      if (!(key in files)) {
        return Promise.reject(
          Object.assign(new Error('missing'), { name: 'NoSuchKey' }),
        );
      }
      return Promise.resolve(files[key]);
    }),
  });

  it('turns a pdf and an image into base64 blocks of the right media type', async () => {
    const result = await readDocuments(
      [att('a.pdf'), att('b.png'), att('c.JPG')],
      storageOf({
        'a.pdf': Buffer.from('pdf'),
        'b.png': Buffer.from('png'),
        'c.JPG': Buffer.from('jpg'),
      }),
    );
    expect(result.documents.map((d) => [d.kind, d.mediaType])).toEqual([
      ['document', 'application/pdf'],
      ['image', 'image/png'],
      ['image', 'image/jpeg'],
    ]);
    expect(result.documents[0].data).toBe(
      Buffer.from('pdf').toString('base64'),
    );
  });

  it('reads the first 3 sheets of an xlsx as text within 200KB', async () => {
    const wb = new ExcelJS.Workbook();
    for (let i = 1; i <= 4; i++) {
      const ws = wb.addWorksheet(`S${i}`);
      ws.addRow([`sheet${i}`, 'x'.repeat(100_000)]);
      ws.addRow([`sheet${i}`, 'y'.repeat(100_000)]);
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const { documents } = await readDocuments(
      [att('q.xlsx')],
      storageOf({ 'q.xlsx': buf }),
    );
    expect(documents[0].kind).toBe('text');
    const text = documents[0].text ?? '';
    expect(text).toContain('sheet1');
    expect(text).not.toContain('sheet4');
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(200 * 1024);
  });

  it('skips unsupported types and missing objects with a reason', async () => {
    const result = await readDocuments(
      [att('a.docx'), att('b.dwg'), att('c.dxf'), att('gone.pdf')],
      storageOf({
        'a.docx': Buffer.from('1'),
        'b.dwg': Buffer.from('1'),
        'c.dxf': Buffer.from('1'),
      }),
    );
    expect(result.documents).toHaveLength(0);
    expect(result.skipped.map((s) => s.fileName)).toEqual([
      'a.docx',
      'b.dwg',
      'c.dxf',
      'gone.pdf',
    ]);
    expect(result.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('skips an image over 5MB and keeps the rest', async () => {
    const result = await readDocuments(
      [att('big.png'), att('ok.png')],
      storageOf({
        'big.png': Buffer.alloc(5 * 1024 * 1024 + 1, 1),
        'ok.png': Buffer.from('png'),
      }),
    );
    expect(result.documents.map((d) => d.fileName)).toEqual(['ok.png']);
    expect(result.skipped.map((s) => s.fileName)).toEqual(['big.png']);
  });

  it('reads at most 10 files', async () => {
    const names = Array.from({ length: 11 }, (_, i) => `f${i}.pdf`);
    const files = Object.fromEntries(names.map((n) => [n, Buffer.from('x')]));
    const result = await readDocuments(
      names.map((n) => att(n)),
      storageOf(files),
    );
    expect(result.documents).toHaveLength(10);
    expect(result.skipped.map((s) => s.fileName)).toEqual(['f10.pdf']);
  });

  it('skips the file that pushes the base64 total past 20MB', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024, 1);
    const result = await readDocuments(
      [att('a.pdf'), att('b.pdf'), att('c.pdf')],
      storageOf({ 'a.pdf': big, 'b.pdf': big, 'c.pdf': big }),
    );
    expect(result.documents).toHaveLength(1);
    expect(result.skipped.map((s) => s.fileName)).toEqual(['b.pdf', 'c.pdf']);
  });
});

describe('buildPrefillPrompt', () => {
  const base = { requirements: 'cần tủ', documents: [], skipped: [], catalog };

  it('carries the template, catalog ids, the no-price rule and data tags', () => {
    const { system, content } = buildPrefillPrompt({
      ...base,
      template: {
        panels: [
          {
            tag: 'TPL-PANEL',
            description: 'Tủ mẫu',
            quantity: 1,
            lines: [
              { itemId: 2, quantity: 3, groupLabel: 'Busbar', note: null },
            ],
          },
        ],
      },
    });
    const text = content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n');
    expect(system).toMatch(/không.*(giá|tiền)/i);
    expect(system).toMatch(/không phải lệnh/i);
    expect(system).toContain('rows');
    expect(system).toMatch(/không dùng số thứ tự.*làm tên tủ/);
    expect(text).toContain('TPL-PANEL');
    expect(text).toContain('Busbar');
    expect(text).toContain('MCCB-100');
    expect(text).toContain('<yeu_cau_ky_thuat>');
  });

  it('throws CatalogTooLargeError above 3000 items', () => {
    const big = Array.from({ length: 3001 }, (_, i) => ({
      id: i + 1,
      code: `C${i}`,
      name: 'n',
      brand: null,
      unit: 'cái',
    }));
    expect(() => buildPrefillPrompt({ ...base, catalog: big })).toThrow(
      CatalogTooLargeError,
    );
  });
});

describe('AnthropicAiClient', () => {
  const request = {
    system: 's',
    content: [
      { type: 'text' as const, text: 'hi' },
      { type: 'document' as const, mediaType: 'application/pdf', data: 'QQ==' },
    ],
    toolName: 'submit_estimate',
    toolSchema: { type: 'object' },
  };
  const settings = { apiKey: 'sk-ant-TEST', model: 'claude-test' };
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  const respond = (status: number, body: unknown) =>
    jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  const client = (fetchFn: jest.Mock, settingsOver: { apiKey?: string } = {}) =>
    new AnthropicAiClient({ ...settings, ...settingsOver }, fetchFn, logger);

  beforeEach(() => jest.clearAllMocks());

  it('sends a forced tool call and returns the tool input', async () => {
    const fetchFn = respond(200, {
      content: [
        { type: 'text', text: 'x' },
        { type: 'tool_use', name: 'submit_estimate', input: { a: 1 } },
      ],
    });
    await expect(client(fetchFn).extract(request)).resolves.toEqual({ a: 1 });
    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-TEST');
    const body = JSON.parse(init.body) as {
      tool_choice: unknown;
      max_tokens: number;
      messages: Array<{ content: unknown[] }>;
    };
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_estimate' });
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0].content[1]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'QQ==' },
    });
  });

  it('throws AiNotConfiguredError without a key and does not call out', async () => {
    const fetchFn = jest.fn();
    await expect(
      client(fetchFn, { apiKey: undefined }).extract(request),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps 429 to AiRateLimitedError and other HTTP errors to AiInternalError', async () => {
    await expect(
      client(respond(429, {})).extract(request),
    ).rejects.toBeInstanceOf(AiRateLimitedError);
    await expect(
      client(respond(400, {})).extract(request),
    ).rejects.toBeInstanceOf(AiInternalError);
  });

  it('maps a timeout to AiTimeoutError', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('t'), { name: 'TimeoutError' }),
      );
    await expect(client(fetchFn).extract(request)).rejects.toBeInstanceOf(
      AiTimeoutError,
    );
  });

  it('rejects a reply without the tool call as invalid output', async () => {
    await expect(
      client(respond(200, { content: [{ type: 'text', text: 'x' }] })).extract(
        request,
      ),
    ).rejects.toBeInstanceOf(AiOutputInvalidError);
  });

  it('never leaks the key or upstream text through the error or the log', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('boom sk-ant-TEST'));
    const error = await client(fetchFn)
      .extract(request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiInternalError);
    const logged = JSON.stringify([
      (error as Error).message,
      (error as Error).stack,
      logger.warn.mock.calls,
      logger.error.mock.calls,
      logger.log.mock.calls,
    ]);
    expect(logged).not.toContain('sk-ant-TEST');
    expect(logged).not.toContain('boom');
  });
});

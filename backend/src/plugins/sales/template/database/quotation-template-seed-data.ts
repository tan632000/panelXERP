import type { ItemGroup } from '@plugins/catalog/item/enums/item-group.enum';

/**
 * Transcribed from the production orders in docs/baogia (LSX-115, 122, 123, 125, 127). Only a
 * source line that carries a part number is kept; a line without one is dropped, never
 * given an invented code. Quantities are per panel (the per-cabinet norm). Items carry no price.
 */
export interface SeedItem {
  name: string;
  brand: string | null;
  group: ItemGroup;
  unit: string;
}

/** `[item code, quantity, load group label]`; the label is absent for the panel's main lines. */
export type SeedLine = [code: string, quantity: number, groupLabel?: string];

export interface SeedPanel {
  tag: string;
  description: string;
  quantity: number;
  lines: SeedLine[];
}

export interface SeedTemplate {
  code: string;
  name: string;
  description: string;
  panels: SeedPanel[];
}

const item = (
  name: string,
  brand: string | null,
  group: ItemGroup,
  unit = 'Cái',
): SeedItem => ({ name, brand, group, unit });

export const SEED_ITEMS: Record<string, SeedItem> = {
  // Enclosures — the part number cell holds the cabinet size.
  '1800x800x400': item(
    'Vỏ tủ điện 1800x800x400, tôn dày 2mm',
    null,
    'enclosure',
  ),
  '500x350x200': item('Vỏ tủ điện 500x350x200', null, 'enclosure'),
  '700x500x250': item('Vỏ tủ điện 700x500x250', null, 'enclosure'),
  // Breakers
  'BW32AAG 3P 10A': item('MCCB 3P 10A', 'Fuji', 'breaker'),
  'BW32AAG 3P 20A': item('MCCB 3P 20A', 'Fuji', 'breaker'),
  'BW32AAG-3P30': item('MCCB 3P 30A', 'Fuji', 'breaker'),
  'BW50EAG-3P040': item('MCCB 3P 40A 10kA', 'Fuji', 'breaker'),
  'BW63RAG-3P': item('MCCB 3P 63A 10kA', 'Fuji', 'breaker'),
  'BW100EAG-3P': item('MCCB 3P 100A 10kA', 'Fuji', 'breaker'),
  'BW163E0 3P 150A': item('MCCB 3P 150A 18kA', 'Fuji', 'breaker'),
  'BW253E0 3P 200A': item('MCCB 3P 200A 18kA', 'Fuji', 'breaker'),
  'BW253E0 3P 250A': item('MCCB 3P 250A 18kA', 'Fuji', 'breaker'),
  'BW800EAG-3P': item('MCCB 3P 800A 36kA', 'Fuji', 'breaker'),
  'BCL63E0CG-1P006': item('MCB 1P 6A', 'Fuji', 'breaker'),
  'BCL63E0CG-2P010': item('MCB 2P 10A', 'Fuji', 'breaker'),
  'BCL63E0CG-2P032': item('MCB 2P 32A', 'Fuji', 'breaker'),
  'BCL63E0CG-2P040': item('MCB 2P 40A', 'Fuji', 'breaker'),
  'BCL63E0CG-3P010': item('MCB 3P 10A', 'Fuji', 'breaker'),
  'BCL63E0CG-3P020': item('MCB 3P 20A', 'Fuji', 'breaker'),
  'BCL63E0CG-3P032': item('MCB 3P 32A', 'Fuji', 'breaker'),
  'BCL63E0CG-3P040': item('MCB 3P 40A', 'Fuji', 'breaker'),
  'ABN103c 3P 100A': item('MCCB 3P 100A', 'LS', 'breaker'),
  'LA63N 1P 16A': item('MCB 1P 16A 6kA', 'LS', 'breaker'),
  'LA63N 3P 16A': item('MCB 3P 16A 6kA', 'LS', 'breaker'),
  'LA63N 3P 32A': item('MCB 3P 32A 6kA', 'LS', 'breaker'),
  B60020WN: item('ATS 3P 200A ON-OFF-ON', 'Vitzro', 'breaker'),
  // Contactors
  'SC-03': item('Khởi động từ 9A', 'Fuji', 'contactor'),
  'SC-4-1': item('Khởi động từ 22A (NO)', 'Fuji', 'contactor'),
  'SC-5-1': item('Khởi động từ 22A (NO+NC)', 'Fuji', 'contactor'),
  'SC-N1': item('Khởi động từ 32A', 'Fuji', 'contactor'),
  'SC-N2': item('Khởi động từ 40A', 'Fuji', 'contactor'),
  // Relays
  'TR-0N(5–8)': item('Rơ le nhiệt (5–8A)', 'Fuji', 'relay'),
  RXM2LB2P7: item('Rơ le trung gian kèm đế 220Vac', 'Schneider', 'relay'),
  '61F-GP-N': item('Bộ báo mức nước', 'Omron', 'relay'),
  'TS2M1-1-16A-230V': item('Bộ định thời gian 24h', 'Selec', 'relay'),
  // Inverters and controllers
  'FRN0029E3S-4G': item('Biến tần 15kW 3 pha 400V', 'Fuji', 'inverter'),
  'FRN0018C2S-4A': item('Biến tần 7.5kW', 'Fuji', 'inverter'),
  'KTP900 Basic 6AV2123-2JB03-0AX0': item('HMI 9 inch', 'Siemens', 'plc'),
  // Accessories
  DF2CA02: item('Cầu chì', 'Schneider', 'accessory'),
  'RT 18-32X': item('Cầu chì 2A + ruột', 'Morele', 'accessory'),
  'ML22-22': item('Đèn báo pha', 'Morele', 'accessory'),
  MLST: item('Nút dừng khẩn cấp', 'Morele', 'accessory'),
  ML11D: item('Nút nhấn xanh có đèn 220V', 'Morele', 'accessory'),
  ML11: item('Nút nhấn đỏ không có đèn', 'Morele', 'accessory'),
  ML20X: item('Công tắc xoay 3 vị trí', 'Morele', 'accessory'),
  XA2AD33: item('Công tắc xoay 3 vị trí', 'Schneider', 'accessory'),
  ML: item('Nút nhấn ON - OFF', 'Morele', 'accessory', 'Bộ'),
  ML96: item('Đồng hồ cơ Volt', 'Morele', 'accessory'),
  MSQ: item('Biến dòng 800/5A', 'Morele', 'accessory'),
  MFM383A: item('Đồng hồ đa năng', 'Selec', 'accessory'),
  VAF36A: item('Đồng hồ đo đa năng V, A', 'Selec', 'accessory'),
  'S8VK-C12024': item('Bộ nguồn 24Vdc 5A', 'Omron', 'accessory'),
  '12038 HSL': item('Quạt làm mát tủ điện', 'Asia', 'accessory'),
};

/** Lines of one load group; every line shares the label. */
const group = (label: string, ...lines: Array<[string, number]>): SeedLine[] =>
  lines.map(([code, quantity]) => [code, quantity, label]);

const uvTimer = (label: string, mcb: string): SeedLine[] =>
  group(label, [mcb, 1], ['SC-N1', 1], ['TS2M1-1-16A-230V', 1], ['ML', 1]);

/** Incoming MCCB, panel meters and indicator lamps every distribution panel opens with. */
const feeder = (withMeter: boolean): SeedLine[] => [
  ['BW253E0 3P 200A', 1],
  ...(withMeter ? ([['ML96', 1]] as SeedLine[]) : []),
  ['RT 18-32X', 3],
  ['ML22-22', 3],
];

const distributionPanels: SeedPanel[] = [
  {
    tag: 'TĐT tổng',
    description: 'Tủ điện phân phối tổng 2 lớp cánh',
    quantity: 1,
    lines: [
      ['BW800EAG-3P', 1],
      ['BW253E0 3P 250A', 2],
      ['BW253E0 3P 200A', 6],
      ['BW163E0 3P 150A', 1],
      ['BW50EAG-3P040', 3],
      ['BCL63E0CG-3P040', 1],
      ['BCL63E0CG-2P040', 1],
      ['MFM383A', 1],
      ['MSQ', 3],
      ['ML22-22', 3],
      ['RT 18-32X', 3],
    ],
  },
  {
    tag: 'TĐT1 nồi hơi',
    description: 'Tủ điện cho khu vực nồi hơi',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BW50EAG-3P040', 3],
      ['BW32AAG 3P 20A', 1],
      ['BCL63E0CG-3P032', 1],
      ['BCL63E0CG-2P032', 1],
    ],
  },
  {
    tag: 'TĐT2 thanh trùng-bao bì',
    description: 'Tủ điện cho khu thanh trùng, bao bì',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BCL63E0CG-1P006', 1],
      ...group('Điều hòa, thông gió', ['BW50EAG-3P040', 1]),
      ...group(
        'Máy sấy gió lật ngược, máy làm mát',
        ['BW50EAG-3P040', 2],
        ['SC-N2', 2],
        ['ML', 2],
      ),
      ...group(
        'Máy lưới sàng rung, máy tiệt trùng, máy nâng',
        ['BW32AAG 3P 20A', 3],
        ['SC-5-1', 3],
        ['ML', 3],
      ),
      ...group(
        'Chiếu sáng thanh trùng, chiếu sáng bao bì',
        ['BCL63E0CG-2P032', 2],
        ['SC-N1', 2],
        ['ML', 2],
      ),
      ...uvTimer('Đèn UV (timer hẹn giờ)', 'BCL63E0CG-3P032'),
      ...group('Dự phòng 1 (MCB 3P 32A)', ['BCL63E0CG-3P032', 1]),
      ...group('Dự phòng 2 (MCB 2P 32A)', ['BCL63E0CG-2P032', 1]),
    ],
  },
  {
    tag: 'TĐT3 đóng gói',
    description: 'Tủ điện khu đóng gói',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BCL63E0CG-1P006', 1],
      ...group('Điều hòa', ['BW50EAG-3P040', 1]),
      ...group(
        'Máy đóng gói 1,...,9',
        ['BW32AAG-3P30', 9],
        ['SC-N1', 9],
        ['ML', 9],
      ),
      ...group(
        'Chiếu sáng đóng gói',
        ['BCL63E0CG-2P032', 1],
        ['SC-N1', 1],
        ['ML', 1],
      ),
      ...uvTimer('Đèn UV (timer hẹn giờ)', 'BCL63E0CG-2P032'),
      ...group('Dự phòng', ['BCL63E0CG-2P032', 1]),
    ],
  },
  {
    tag: 'TĐT4 đồ chín',
    description: 'Tủ điện khu đồ chín',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BCL63E0CG-1P006', 1],
      ...group('Điều hòa', ['BW50EAG-3P040', 1]),
      ...group(
        'Máy trộn gia vị 1,2 - máy cắt chân rút 1,2',
        ['BW32AAG 3P 20A', 4],
        ['SC-4-1', 4],
        ['ML', 4],
      ),
      ...group(
        'Máy sấy khu giá kệ',
        ['BW50EAG-3P040', 1],
        ['SC-N2', 1],
        ['ML', 1],
      ),
      ...group('Máy thổi', ['BW32AAG-3P30', 1], ['SC-N1', 1], ['ML', 1]),
      ...group(
        'Chiếu sáng (khu thay đồ, hành lang, khu phân loại chín)',
        ['BCL63E0CG-2P032', 3],
        ['SC-N1', 3],
        ['ML', 3],
      ),
      ...uvTimer('Đèn UV (timer hẹn giờ)', 'BCL63E0CG-2P032'),
      ...group('Dự phòng 1', ['BCL63E0CG-3P032', 1]),
      ...group('Dự phòng 2', ['BCL63E0CG-2P032', 1]),
    ],
  },
  {
    tag: 'TĐT5 đồ sống',
    description: 'Tủ điện khu đồ sống',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BCL63E0CG-1P006', 1],
      ...group('Điều hòa phòng ngâm canh 40A', ['BW50EAG-3P040', 1]),
      ...group('Điều hòa khu nấu luộc, khu xả hàng', ['BW32AAG-3P30', 2]),
      ...group('Máy nâng', ['BW32AAG 3P 20A', 1], ['SC-4-1', 1], ['ML', 1]),
      ...group(
        'Máy rửa sóng bão, máy luộc chín',
        ['BW32AAG-3P30', 2],
        ['SC-N1', 2],
        ['ML', 2],
      ),
      ...group(
        'Máy làm mát, máy sấy khu giá kệ',
        ['BW50EAG-3P040', 2],
        ['SC-N2', 2],
        ['ML', 2],
      ),
      ...group(
        'Chiếu sáng khu thay đồ, khu xả hàng, khu nấu luộc, khu ngâm canh',
        ['BCL63E0CG-2P032', 4],
        ['SC-N1', 4],
        ['ML', 4],
      ),
      ...uvTimer('Đèn UV (timer)', 'BCL63E0CG-2P032'),
      ...group('Cấp nguồn phòng gia vị', ['BW32AAG-3P30', 1]),
      ...group('Dự phòng 3P 32A', ['BCL63E0CG-3P032', 2]),
      ...group('Dự phòng 2P 32A', ['BCL63E0CG-2P032', 1]),
    ],
  },
  {
    tag: 'TĐT6 kho lạnh -18',
    description: 'Tủ điện khu kho lạnh -18 độ',
    quantity: 1,
    lines: [
      ...feeder(true),
      ['BCL63E0CG-1P006', 1],
      ...group('Điều hòa (MCCB 3P 40A)', ['BW50EAG-3P040', 2]),
      ...group(
        'Chiếu sáng kho lạnh 1, 2',
        ['BCL63E0CG-2P032', 2],
        ['SC-N1', 2],
        ['ML', 2],
      ),
      ...uvTimer('Đèn UV (timer hẹn giờ)', 'BCL63E0CG-2P032'),
      ...group('Dự phòng 1 (MCB 3P 32A)', ['BCL63E0CG-3P032', 1]),
      ...group('Dự phòng 2 (MCB 2P 32A)', ['BCL63E0CG-2P032', 1]),
    ],
  },
  {
    tag: 'TĐT7 container lạnh',
    description: 'Tủ điện cho container lạnh',
    quantity: 1,
    lines: [
      ...feeder(false),
      ...group('Container lạnh 1,2,3', ['BW63RAG-3P', 3]),
      ...group('Dự phòng (MCB 3P 32A)', ['BCL63E0CG-3P032', 2]),
    ],
  },
];

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    code: 'TPL_0001',
    name: 'Tủ lò hơi 6.5T',
    description: 'Tủ điện lò hơi 6.5 tấn (LSX-125)',
    panels: [
      {
        tag: 'Tủ lò hơi 6.5T',
        description: 'Tủ điện lò hơi 6.5 tấn',
        quantity: 1,
        lines: [
          ['1800x800x400', 1],
          ['BW32AAG 3P 10A', 1],
          ['BCL63E0CG-2P010', 1],
          ['DF2CA02', 3],
          ['61F-GP-N', 3],
          ['S8VK-C12024', 1],
          ['VAF36A', 1],
          ['12038 HSL', 2],
          ...group('PLC và Scada', ['KTP900 Basic 6AV2123-2JB03-0AX0', 1]),
          ...group(
            'Quạt hút khói tạo chênh áp 11 KW',
            ['BCL63E0CG-3P020', 1],
            ['FRN0029E3S-4G', 1],
            ['RXM2LB2P7', 2],
            ['XA2AD33', 1],
          ),
          ...group(
            'Bơm cấp 7.5 KW',
            ['BCL63E0CG-3P020', 2],
            ['FRN0018C2S-4A', 2],
            ['RXM2LB2P7', 2],
            ['XA2AD33', 2],
          ),
          ...group(
            'Đầu đốt',
            ['BCL63E0CG-3P032', 1],
            ['SC-4-1', 1],
            ['RXM2LB2P7', 5],
            ['XA2AD33', 1],
          ),
        ],
      },
    ],
  },
  {
    code: 'TPL_0002',
    name: 'Tủ bật tắt vít tải 2.2kW',
    description: 'Tủ điện bật tắt vít tải 2.2kW (LSX-122)',
    panels: [
      {
        tag: 'Tủ bật tắt vít tải 2.2kW',
        description: 'Tủ điện bật tắt vít tải',
        quantity: 1,
        lines: [
          ['500x350x200', 1],
          ['BCL63E0CG-3P010', 1],
          ['RT 18-32X', 3],
          ['ML22-22', 3],
          ['MLST', 1],
          ...group(
            'Vít tải 2.2KW',
            ['SC-03', 1],
            ['TR-0N(5–8)', 1],
            ['ML11D', 1],
            ['ML11', 1],
          ),
        ],
      },
    ],
  },
  {
    code: 'TPL_0003',
    name: 'Tủ ổ cắm',
    description: 'Tủ ổ cắm, 3 tủ giống nhau (LSX-123)',
    panels: [
      {
        tag: 'Tủ ổ cắm',
        description: 'Tủ ổ cắm',
        quantity: 3,
        lines: [
          ['700x500x250', 1],
          ['ABN103c 3P 100A', 2],
          ['RT 18-32X', 3],
          ['ML22-22', 3],
          ['LA63N 1P 16A', 2],
          ['LA63N 3P 16A', 1],
          ['LA63N 3P 32A', 1],
        ],
      },
    ],
  },
  {
    code: 'TPL_0004',
    name: 'Tủ ATS 200A',
    description: 'Tủ ATS 200A (LSX-127)',
    panels: [
      {
        tag: 'Tủ ATS 200A',
        description: 'Tủ ATS',
        quantity: 1,
        lines: [
          ['RT 18-32X', 9],
          ['ML22-22', 9],
          ['ML20X', 2],
          ['B60020WN', 1],
          ['BW253E0 3P 200A', 1],
          ['BCL63E0CG-3P040', 1],
          ['BW100EAG-3P', 3],
        ],
      },
    ],
  },
  {
    code: 'TPL_0005',
    name: 'Tủ phân phối đa tủ',
    description: 'Hệ tủ phân phối tổng và 7 tủ nhánh (LSX-115)',
    panels: distributionPanels,
  },
];

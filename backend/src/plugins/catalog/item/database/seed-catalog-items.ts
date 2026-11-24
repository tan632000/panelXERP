import type { ItemGroup } from '@plugins/catalog/item/enums/item-group.enum';
import type { DataSource } from 'typeorm';

/**
 * `[code, name, brand, group, unit]`, transcribed from the boiler panel production orders
 * LSX-124 and LSX-126 in docs/baogia. Only a source line that carries a part number is kept;
 * a line without one is dropped, never given an invented code. Items carry no price.
 */
type CatalogSeedItem = [
  code: string,
  name: string,
  brand: string | null,
  group: ItemGroup,
  unit?: string,
];

export const CATALOG_SEED_ITEMS: CatalogSeedItem[] = [
  // Enclosures — the part number cell holds the cabinet size.
  ['1200x800x350', 'Vỏ tủ điện trong nhà 1200x800x350', 'TVT', 'enclosure'],
  ['800x1800x500', 'Vỏ tủ điện trong nhà 800x1800x500', 'TVT', 'enclosure'],
  // Breakers
  ['BW103E0 3P 100A', 'MCCB 3P 100A 18kA', 'Fuji', 'breaker'],
  ['BCL63E0CG-3P025', 'MCB 3P 25A', 'Fuji', 'breaker'],
  // Contactors and thermal relays
  ['SC-4-0', 'Khởi động từ 16A', 'Fuji', 'contactor'],
  ['TR-5-1N (12-18)', 'Rơ le nhiệt (12–18A)', 'Fuji', 'relay'],
  ['TR-0N(4–6)', 'Rơ le nhiệt (4–6A)', 'Fuji', 'relay'],
  // Level and pressure sensing
  ['FS-3A', 'Báo mức kèm đế', 'Hanyoung', 'relay', 'Bộ'],
  ['61F-G3', 'Báo mức nước', 'Hanyoung', 'relay'],
  ['KP36', 'Công tắc áp suất', 'Danfoss', 'accessory'],
  // Inverters
  ['EMD800-037-3/3B', 'Biến tần 37kW', 'Elektrim', 'inverter'],
  ['EMD800-7R5-3B', 'Biến tần 7.5kW', 'Elektrim', 'inverter'],
  ['EMD800-5R5-3B', 'Biến tần 5.5kW', 'Elektrim', 'inverter'],
  // PLC (Siemens S7-1200) and its modules
  ['6ES7214-1AH50-0XB0', 'PLC S7-1200 CPU 1214C', 'Siemens', 'plc'],
  ['6ES7231-5QF50-0XB0', 'Module SM 1231 4AI TC', 'Siemens', 'plc'],
  [
    '6ES7241-1EA50-0XB0',
    'Module truyền thông CM 1241 RS232/422/485',
    'Siemens',
    'plc',
  ],
  ['6ES7231-4HD50-0XB0', 'Signal Board SB 1231 4AI', 'Siemens', 'plc'],
  ['6ES7223-5PL50-0XB0', 'Module SM 1223 16DI/16DO', 'Siemens', 'plc'],
  // Accessories
  ['6EP1334-2BA20', 'Bộ nguồn 24VDC 10A', 'Siemens', 'accessory'],
  ['HY-606-24', 'Còi 24V', 'Hanyoung', 'accessory'],
  ['YW1S-3E20', 'Công tắc xoay 3 vị trí', 'Idec', 'accessory'],
  ['20060HBL', 'Quạt làm mát tủ điện', 'Morele', 'accessory'],
];

/**
 * Adds the part numbers above to the catalog. A code that is already live, in any casing, is
 * left alone, so running it again adds nothing and never overwrites an edit made in the UI.
 */
export async function seedCatalogItems(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    for (const [code, name, brand, group, unit = 'Cái'] of CATALOG_SEED_ITEMS) {
      await manager.query(
        `INSERT INTO items (code, name, brand, item_group, unit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (LOWER(code)) WHERE is_deleted = false DO NOTHING`,
        [code, name, brand, group, unit],
      );
    }
  });
}

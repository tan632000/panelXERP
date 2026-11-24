import {
  SEED_ITEMS,
  SEED_TEMPLATES,
} from '@plugins/sales/template/database/quotation-template-seed-data';

import type { DataSource, EntityManager } from 'typeorm';

/**
 * Adds the part numbers the templates name (no price) without touching an item that already
 * has the code, in any casing, then returns each item's id by lower-cased code.
 */
async function ensureItems(
  manager: EntityManager,
): Promise<Map<string, number>> {
  for (const [code, seedItem] of Object.entries(SEED_ITEMS)) {
    await manager.query(
      `INSERT INTO items (code, name, brand, item_group, unit)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (LOWER(code)) WHERE is_deleted = false DO NOTHING`,
      [code, seedItem.name, seedItem.brand, seedItem.group, seedItem.unit],
    );
  }
  const rows: Array<{ id: number; code: string }> = await manager.query(
    `SELECT id, LOWER(code) AS code FROM items
      WHERE is_deleted = false AND LOWER(code) = ANY($1)`,
    [Object.keys(SEED_ITEMS).map((code) => code.toLowerCase())],
  );
  return new Map(rows.map((row) => [row.code, row.id]));
}

/**
 * Seeds the five reference templates. A template whose code is already live is left alone, so
 * running it again adds nothing and never undoes an edit made in the UI.
 */
export async function insertQuotationTemplates(
  manager: EntityManager,
): Promise<void> {
  const itemIds = await ensureItems(manager);

  for (const template of SEED_TEMPLATES) {
    const existing: unknown[] = await manager.query(
      `SELECT 1 FROM quotation_templates
        WHERE LOWER(code) = LOWER($1) AND is_deleted = false`,
      [template.code],
    );
    if (existing.length > 0) continue;

    const [{ id: templateId }]: Array<{ id: number }> = await manager.query(
      `INSERT INTO quotation_templates (code, name, description)
       VALUES ($1, $2, $3) RETURNING id`,
      [template.code, template.name, template.description],
    );
    for (const panel of template.panels) {
      const [{ id: panelId }]: Array<{ id: number }> = await manager.query(
        `INSERT INTO quotation_template_panels (template_id, tag, description, quantity)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [templateId, panel.tag, panel.description, panel.quantity],
      );
      for (const [code, quantity, groupLabel] of panel.lines) {
        const itemId = itemIds.get(code.toLowerCase());
        if (itemId === undefined) {
          throw new Error(`Seed item "${code}" is missing from SEED_ITEMS`);
        }
        await manager.query(
          `INSERT INTO quotation_template_lines (panel_id, item_id, quantity, group_label)
           VALUES ($1, $2, $3, $4)`,
          [panelId, itemId, quantity, groupLabel ?? null],
        );
      }
    }
  }
}

/** Feature seed: runs only under SEED_SCOPE=all, all-or-nothing. */
export async function seedQuotationTemplates(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction((manager) => insertQuotationTemplates(manager));
}

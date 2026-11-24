/** Name the template registers under at the item delete check. */
export const QUOTATION_TEMPLATE_ITEM_REFERENCE_CHECK = 'quotation_template';

/** An item named by a line of a live template cannot be deleted. */
export const ITEM_IN_LIVE_TEMPLATE_SQL = `
  SELECT 1
  FROM quotation_template_lines line
  JOIN quotation_template_panels panel ON panel.id = line.panel_id
  JOIN quotation_templates template ON template.id = panel.template_id
  WHERE line.item_id = $1 AND template.is_deleted = false
  LIMIT 1
`;

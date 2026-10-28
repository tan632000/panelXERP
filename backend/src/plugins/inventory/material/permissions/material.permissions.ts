/** The material view of orders: demand, reserved, issued and short per item, no sales money. */
export const MATERIAL_READ = 'material:read' as const;

export const materialPermissions = [MATERIAL_READ] as const;

import { holds } from '@kernel/core/database/seeds/permission-scope-conversion';
import { seededRolePermissions } from '@kernel/core/database/seeds/seed-roles';

/** The permission set of one seeded role, as the guard would read it. */
function grantsOf(roleCode: string): Set<string> {
  const permissions = seededRolePermissions(roleCode);
  if (!permissions) throw new Error(`Role ${roleCode} is not seeded`);
  return new Set(permissions);
}

const scopes = (module: string, actions: string[]) =>
  actions.map((action) => `${module}:${action}`);

const STOCK_VIEW = scopes('stock', ['availability', 'read', 'ledger']);

const SALES_CHAIN_MODULES = [
  'customer',
  'contact',
  'project',
  'request',
  'estimate',
  'quotation',
  'order',
];
const SALES_CHAIN_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'assign',
  'submit',
  'approve',
  'confirm',
  'cancel',
  'export',
];

/** Each role's P2 grants; a scope in `refused` must not be held, wildcards included. */
const MATRIX: Record<string, { granted: string[]; refused: string[] }> = {
  storekeeper: {
    granted: [
      'item:read',
      'item:stock_settings',
      ...scopes('location', ['read', 'create', 'update', 'delete']),
      ...STOCK_VIEW,
      'material:read',
      'supplier:read',
      'purchase_order:read',
      ...scopes('purchase_request', ['read', 'create']),
      ...scopes('stock_receipt', ['read', 'create']),
      ...scopes('stock_issue', ['read', 'create']),
      ...scopes('stock_return', ['read', 'create']),
      ...scopes('stocktake', ['read', 'create', 'update', 'submit', 'cancel']),
    ],
    refused: [
      'reference_price:read',
      'purchase_price:read',
      'purchase_order:create',
      'purchase_order:update',
      'purchase_order:approve',
      'supplier:create',
      'purchase_request:update',
      'purchase_request:approve',
      'stocktake:approve',
      'item:create',
      'item:update',
      'item:delete',
    ],
  },
  purchasing: {
    granted: [
      'item:create',
      'item:stock_settings',
      'reference_price:read',
      'purchase_price:read',
      'location:read',
      ...scopes('supplier', ['read', 'create', 'update', 'delete']),
      ...scopes('purchase_request', ['read', 'create', 'update', 'approve']),
      ...scopes('purchase_order', [
        'read',
        'create',
        'update',
        'submit',
        'cancel',
        'close',
      ]),
      ...STOCK_VIEW,
      'material:read',
      'stock_receipt:read',
      'stock_issue:read',
      'stock_return:read',
      'stocktake:read',
    ],
    refused: [
      'purchase_order:approve',
      'location:create',
      'location:update',
      'location:delete',
      'stock_receipt:create',
      'stock_issue:create',
      'stock_return:create',
      'stocktake:create',
      'stocktake:approve',
    ],
  },
  director: {
    granted: [
      'item:create',
      'item:stock_settings',
      'reference_price:read',
      'purchase_price:read',
      ...scopes('supplier', ['read', 'create', 'update', 'delete']),
      'location:read',
      'purchase_request:read',
      ...scopes('purchase_order', [
        'read',
        'create',
        'update',
        'submit',
        'cancel',
        'close',
        'approve',
      ]),
      ...STOCK_VIEW,
      'material:read',
      'stock_receipt:read',
      'stock_issue:read',
      'stock_return:read',
      ...scopes('stocktake', ['read', 'approve']),
      'purchase_request:create',
      'purchase_request:update',
      'location:create',
      'stock_receipt:create',
      'stock_issue:create',
      'stock_return:create',
      'stocktake:create',
      'stocktake:submit',
    ],
    refused: [],
  },
  salesManager: {
    granted: [
      'reference_price:read',
      'purchase_price:read',
      ...STOCK_VIEW,
      'material:read',
    ],
    refused: [
      'purchase_request:read',
      'purchase_order:read',
      'supplier:read',
      'location:read',
      'stock_receipt:read',
      'stocktake:read',
    ],
  },
  sales: {
    granted: ['reference_price:read', 'stock:availability', 'material:read'],
    refused: [
      'purchase_price:read',
      'stock:read',
      'stock:ledger',
      'purchase_request:read',
      'purchase_order:read',
      'supplier:read',
      'location:read',
    ],
  },
  engineeringLead: {
    granted: [
      'item:create',
      'item:stock_settings',
      'stock:availability',
      'material:read',
      ...scopes('purchase_request', ['read', 'create']),
    ],
    refused: [
      'reference_price:read',
      'estimate:price',
      'purchase_price:read',
      'stock:read',
      'stock:ledger',
      'purchase_request:update',
      'purchase_order:read',
      'supplier:read',
    ],
  },
  engineer: {
    granted: [
      'stock:availability',
      ...scopes('purchase_request', ['read', 'create']),
    ],
    refused: [
      'reference_price:read',
      'estimate:price',
      'purchase_price:read',
      'stock:read',
      'stock:ledger',
      'material:read',
      'purchase_request:update',
      'purchase_order:read',
      'supplier:read',
      'item:stock_settings',
    ],
  },
};

describe('P2 role matrix', () => {
  for (const [role, { granted, refused }] of Object.entries(MATRIX)) {
    it(`${role} holds every granted scope`, () => {
      const grants = grantsOf(role);
      expect(granted.filter((scope) => !holds(grants, scope))).toEqual([]);
    });

    it(`${role} holds none of the refused scopes`, () => {
      const grants = grantsOf(role);
      expect(refused.filter((scope) => holds(grants, scope))).toEqual([]);
    });
  }

  it('keeps the storekeeper off every sales-chain scope', () => {
    const grants = grantsOf('storekeeper');
    const held = SALES_CHAIN_MODULES.flatMap((module) =>
      SALES_CHAIN_ACTIONS.map((action) => `${module}:${action}`),
    ).filter((scope) => holds(grants, scope));
    expect(held).toEqual([]);
  });

  it('gives the storekeeper explicit scopes only, no module or action wildcard', () => {
    const wildcards = [...grantsOf('storekeeper')].filter((scope) =>
      scope.includes('*'),
    );
    expect(wildcards).toEqual([]);
  });

  it('lets only the director and the administrator approve a stocktake or a purchase order', () => {
    const roles = ['admin', ...Object.keys(MATRIX)];
    for (const scope of ['stocktake:approve', 'purchase_order:approve']) {
      expect(roles.filter((role) => holds(grantsOf(role), scope))).toEqual([
        'admin',
        'director',
      ]);
    }
  });

  it('shows purchase prices only to purchasing, the director and the sales manager', () => {
    const roles = ['admin', ...Object.keys(MATRIX)];
    expect(
      roles.filter((role) => holds(grantsOf(role), 'purchase_price:read')),
    ).toEqual(['admin', 'purchasing', 'director', 'salesManager']);
  });
});

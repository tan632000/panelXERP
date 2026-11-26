# Task 05 — Supplier invoices attached to purchase orders

Status: pending

## Outcome
An accountant records manual supplier invoices (number, date, optional due date, amount) on an approved-or-later purchase order and can void them; the system enforces status, duplicate numbers per supplier and the PO total; the stock receipt flow is untouched.

## Scope
- In (feature `payable`, D-11, D-09, D-13, D-14): inventory `_shared` port `PurchaseOrderFinancePort` (`lockForPayable(manager, poId)`: PO header `FOR UPDATE` → `{id, code, status, supplierId, supplierName, total, createdBy}` or null; exported by `InventorySharedModule`, `inventory-shared.module.ts:7-12`); permissions `payable:read|manage`; migration of `supplier_invoices` (`purchase_order_id` no FK, `supplier_id`, `invoice_no` ≤ 50, `invoice_date`, `due_date` null, `amount numeric(18,0) > 0`, void columns; partial unique `(supplier_id, lower(invoice_no)) WHERE voided_at IS NULL AND is_deleted = false`). Endpoints (`payable:manage`): `POST /accounting/payables/:purchaseOrderId/invoices` `{invoiceNo, invoiceDate, dueDate?, amount}`, `POST /accounting/supplier-invoices/:id/void` `{reason}`. Inside every write: `lockForPayable` → PO missing → 404 → create paths: status ∉ `approved|partially_received|received|closed` → 409 (`cancelled`, `draft`, `pending_approval` included) → rules: `invoiceDate` > `vnToday()` → 400; `dueDate` < `invoiceDate` → 400; `invoiceNo` trimmed by the DTO, duplicate live `(supplierId, lower(invoiceNo))` → 409 `Supplier invoice number already recorded`; Σ live invoices of the PO + amount > PO total → 409 `Invoices exceed the purchase order total (remaining: N)`; `supplier_id` copied from the locked PO. Void: reason required (400 otherwise), allowed on any PO status (D-13), 409 while the invoice has a live payment (the payment table arrives in task-06; the guard is added there), 409 on a second void. `seed-roles.panel.spec.ts`: remove `payable` from `PENDING_MODULES`. Labels for `payable:*` in vi/en `permission.json`. OpenAPI and `api.ts` regenerated.
- Out: payments (task-06); lists and PO page (task-07); the inventory purchase-order flows (not edited); reminders; screens.

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/inventory/_shared/ports/purchase-order-finance.port.ts` + `.spec.ts`, `backend/src/plugins/accounting/payable/**` (migration `<ts>-init-supplier-invoices.ts`, entity `supplier-invoice.entity.ts`, dto, permissions, `services/supplier-invoice.service.ts` + `.spec.ts`, `services/supplier-invoice-race.spec.ts`, `payable.controller.ts` + `payable.controller.spec.ts`, `payable.module.ts`, `payable-db.helper-spec.ts`)
- Modify: `backend/src/plugins/inventory/_shared/inventory-shared.module.ts`, `backend/src/plugins/accounting/accounting.features.ts`, `accounting.module.ts` (shared registration files), `seed-roles.panel.spec.ts` (PENDING), `frontend/src/kernel/langs/{vi,en}/permission.json`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/inventory/purchase-order/utils/purchase-order-lock.util.ts:12-34`, `backend/src/plugins/inventory/purchase-order/enums/purchase-order-status.enum.ts:1-16`, `backend/src/plugins/inventory/inventory.features.ts`

## Steps
1. Port spec (real Postgres): `lockForPayable` returns header with `total` text, `supplierName`, `createdBy`, holds the row (`queuedBehind`); deleted/unknown → null.
2. Create → `supplier-invoice.service.spec.ts`: PO `approved`, `partially_received`, `received`, `closed` → 2xx; `draft`, `pending_approval`, `cancelled` → 409; invoice 600 then 500 on a 1 000 total → 409 `(remaining: 400)`; duplicate number same supplier → 409 (also `INV-1` versus ` inv-1 `: trim and case), same number on another supplier's PO → 2xx; voided number reusable; `invoiceDate` tomorrow (Vietnam) → 400; `dueDate` before invoice date → 400; `dueDate` omitted → 2xx; amount 0/−1/1.5 → 400; `supplierId` in the body is rejected (400 by whitelist) and the stored value equals the PO's supplier; receipts of the PO are unchanged (row counts of `stock_receipts`, `stock_movements` before/after).
3. Void: with reason → row stays flagged, excluded from the Σ (a following invoice up to the freed room succeeds); empty reason → 400; second void → 409; void on a `cancelled` PO → 2xx.
4. Roles: sales, salesManager, engineer, engineeringLead, purchasing, storekeeper, productionManager, technician, qcInspector → 403 on both routes (D-02: no payable scope outside accountant/director/admin); accountant, director, admin → 2xx.
5. Race → `supplier-invoice-race.spec.ts` (`queuedBehind`, holder holds `purchase_orders`): two invoices that together exceed the total → one 201, one 409; two invoices with one number → one 201, one 409; invoice ∥ PO cancel (cancel committed first) → invoice 409; direct duplicate insert → unique violation (backstop).
6. Registration: `getAllPluginPermissions()` contains `payable:read|manage`; migration table exists; labels, OpenAPI, `api.ts`; the psql check below shows the stored roles hold their scopes (F-03).

## Acceptance
- AC-06; AC-04 (supplier-invoice void); AC-11 (supplier-invoice routes); AC-16 (cancelled PO refuses a new invoice, accepts a void).

## Dependencies
- task-04-receivable-read-model.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/payable/services/supplier-invoice.service.spec.ts && test -f src/plugins/accounting/payable/services/supplier-invoice-race.spec.ts && test -f src/plugins/accounting/payable/payable.controller.spec.ts && test -f src/plugins/inventory/_shared/ports/purchase-order-finance.port.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts && docker compose exec -T postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select count(*) from roles where (code = 'accountant' and not permissions ? 'payable:*') or (code in ('sales','salesManager') and not permissions ? 'receivable:read')\""`
- Named probe: `supplier-invoice.service.spec.ts` (status set, Σ bound, duplicate per supplier, dates, receipts untouched), `supplier-invoice-race.spec.ts` (Σ race, number race, invoice ∥ cancel, backstop), `payable.controller.spec.ts` (403 per role), `purchase-order-finance.port.spec.ts`; P2 regression through `src/plugins/inventory`
- Reachability: known (same form as task-03; `purchase_orders` from P2; `src/plugins/inventory` suite runs in the container).
- Oracle: exit 0, 0 skipped, `permission-labels.test.ts` passes, psql prints `0` (a non-zero count means an administrator-edited role → grant manually per D-02 and record it in the receipt). A void here raises no notice yet: task-08 wires the director notice and the closing of reminder notices for a supplier invoice voided with no payment.
- Counterexample: reading Σ before the PO lock must fail the Σ race; taking `supplier_id` from the body must fail the whitelist/stored-supplier probe; allowing `cancelled` must fail the status set; touching `stock_receipts` must fail the untouched-receipts probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->

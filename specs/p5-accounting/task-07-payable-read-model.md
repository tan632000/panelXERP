# Task 07 — PO payable page and supplier-debt list (API)

Status: pending

## Outcome
An accountant, director or admin reads one purchase order's payable page — invoices with their payments and the PO's invoiced, paid and payable figures — and a filtered, paged supplier-debt list; POs without any invoice can be listed so an accountant can open them; nobody else can read any of it.

## Scope
- In (D-10, D-19, D-02): `PurchaseOrderFinancePort` gains `getHeaders(manager, ids)` (read-only, by id, includes `supplierId`, `supplierName`, `status`, `total`, `createdBy`) and `listUnbilled(manager, {search?, excludePurchaseOrderIds, skip, take})` (POs in `approved|partially_received|received|closed`, not deleted, ordered by `created_at` desc then id). Endpoints (`payable:read`): `GET /accounting/payables/:purchaseOrderId` → `{purchaseOrder: {id, code, status, supplierName, total}, summary: {invoiced, paid, payable}, invoices: [{id, invoiceNo, invoiceDate, dueDate, amount, paid, due, voidedAt, voidReason, payments: [{id, paidDate, amount, method, note, voidedAt, voidReason}]}]}`; unknown PO → 404. `GET /accounting/payables?search=&dueState=&balance=&billed=&page=&limit=` → `{data, meta}` per D-19: `billed=yes` rows from `supplier_invoices` grouped per PO in accounting SQL (figures, `nextDueDate` = earliest `dueDate` among invoices with `due > 0`), PO code/supplier/status hydrated for the page through `getHeaders` (a PO the read does not return is listed with `status: null`, F-04); `search` matches PO code and supplier name, so the SQL first lists the POs that have a live supplier invoice and `searchIds(manager, search, candidateIds)` returns which of those match by PO code or supplier name (no cap and no 400 for a common word, F-08); `billed=no` rows come from `listUnbilled` excluding every PO that has a live invoice. `dueState`, `balance` as D-19 (`overdue` = an invoice with `due > 0` and `dueDate < today`, `upcoming` = `today ≤ dueDate ≤ today + 3`; invoices without a due date never match either). Invalid enum, `page < 1`, `limit` > 100 → 400.
- Out: writes (tasks 05, 06); reminders; screens.

## Coverage
- CP-07

## Ownership
- Create: `backend/src/plugins/accounting/payable/services/payable-query.service.ts` + `.spec.ts`, `services/payable-views.ts`, dto `payable-filter.dto.ts`
- Modify: `backend/src/plugins/inventory/_shared/ports/purchase-order-finance.port.ts` (+ spec), `backend/src/plugins/accounting/payable/{payable.controller.ts,payable.controller.spec.ts,payable.module.ts,payable-db.helper-spec.ts}`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/inventory/purchase-order/entities/purchase-order.entity.ts:14-62`, `backend/src/plugins/inventory/supplier/entities/supplier.entity.ts`

## Steps
1. Figures → `payable-query.service.spec.ts` (real Postgres): invoices 600 000 (paid 200 000) and 400 000 (no payment) → `invoiced 1 000 000`, `paid 200 000`, `payable 800 000`, per-invoice `due` 400 000 / 400 000; voided invoice or payment changes no figure and appears flagged.
2. Filters: `dueState=overdue|upcoming` with clock edges (today, yesterday, +3, +4 at a fake 18:00Z); an invoice without `dueDate` matches neither; `balance=settled` → `invoiced > 0` and `payable = 0`; `search` by PO code and by supplier name (accent-insensitive); `billed=no` lists unbilled POs in payable statuses, never a `draft|pending_approval|cancelled` one and never a billed one; ordering overdue first, then earliest next due date; `meta.total`; a `cancelled` PO with live invoices still listed with live status.
3. Roles (AC-08, AC-11): accountant, director, admin → 200; sales, salesManager, purchasing, storekeeper, engineer, engineeringLead, productionManager, technician, qcInspector → 403 on both routes (no payable scope).
4. Validation: bad enum, `page=0`, `limit=101`, a search word matching every one of 600 bulk-inserted invoiced POs returns a page, never a 400. OpenAPI and `api.ts` regenerated.

## Acceptance
- AC-07 (payable = invoiced − paid per PO); AC-08; AC-11 (payable read routes, every role).

## Dependencies
- task-06-supplier-payments.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/payable/services/payable-query.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/plugins/inventory/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"`
- Named probe: `payable-query.service.spec.ts` (figures, filters, clock edges, billed=no), `payable.controller.spec.ts` (403 per role, 400 validation), `purchase-order-finance.port.spec.ts` (`getHeaders`, `listUnbilled`, `searchIds` over a candidate id list)
- Reachability: known (same form as task-06).
- Oracle: exit 0, 0 skipped.
- Counterexample: counting voided payments in `paid` must fail the figures case; treating a missing `dueDate` as overdue must fail the filter case; letting purchasing read the list must fail the role case; capping `searchIds` must fail the 600-PO search case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->

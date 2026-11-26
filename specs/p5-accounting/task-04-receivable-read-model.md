# Task 04 — Order payment page and customer-debt list (API)

Status: pending

## Outcome
Accountant, director, admin and (own orders only) sales read one order's payment page — header, milestones with their invoices and collections, and the D-10 figures — and a filtered, paged customer-debt list; orders without a payment plan can be listed so an accountant can open them.

## Scope
- In (D-06, D-10, D-19, D-03): `OrderFinancePort` gains `getHeader(manager, orderId)` (read-only, no lock, same shape as `lockForFinance`) and `listUnplanned(manager, {search?, excludeOrderIds, skip, take}, scope)` (orders in `open|in_production|delivered|completed`, not deleted, scope applied in SQL, ordered by `created_at` desc then id). Endpoints (`receivable:read`): `GET /accounting/orders/:orderId` → `{order: {id, code, status, customerName, projectName, total}, plan: {…} | null, summary: {scheduled, unscheduled, invoiced, collected, receivable, toCollect}, milestones: [{id, name, percent, amount, dueDate, invoiced, collected, toCollect, state, invoices: [{id, invoiceNo, invoiceDate, amount, voidedAt, voidReason}], collections: [{id, collectedDate, amount, method, note, voidedAt, voidReason}]}]}` (voided rows listed, flagged, and excluded from the figures); order out of scope or missing → 404. `GET /accounting/receivables?search=&dueState=&balance=&planned=&page=&limit=` → `{data, meta}` per D-19: `planned=yes` rows come from `order_payment_plans` in accounting SQL (snapshot code/customer/project/total, figures, `nextDueDate` = earliest due date among milestones with `toCollect > 0`, `overdueAmount`), scope condition `OrderProductionPort.ownerScopeCondition('plan.order_id', …)` (`all`/`material` → none, `ownSales` → own, other scopes → `FALSE`), live `status` and `salesOwnerName` hydrated for the page through `OrderMaterialReadPort.getOrders`; `planned=no` rows come from `OrderFinancePort.listUnplanned` with only the ids of plans that have at least one live milestone excluded (so an order whose plan has no live milestone is listed, R-06), figures zero; `planned=yes` returns plans with at least one live milestone. When the status hydrate does not return an order of the page, its row carries `status: null` and the page does not fail (F-04). For a caller without `receivable:manage` the response omits the `note` of every collection and the `voidReason` of every invoice and collection (keys absent, D-23). Invalid `dueState|balance|planned`, `page < 1`, `limit` > 100 → 400.
- Out: writes (tasks 02, 03), payables, screens, reminders.

## Coverage
- CP-04

## Ownership
- Create: `backend/src/plugins/accounting/receivable/services/receivable-query.service.ts` + `.spec.ts`, `services/receivable-views.ts`, `services/receivable-scope.util.ts` + `.spec.ts`, dto `receivable-filter.dto.ts`
- Modify: `backend/src/plugins/sales/_shared/ports/order-finance.port.ts` (+ spec), `backend/src/plugins/accounting/receivable/{receivable.controller.ts,receivable.controller.spec.ts,receivable.module.ts,receivable-db.helper-spec.ts}`, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts:96-170`, `backend/src/plugins/delivery/_shared/utils/delivery-scope.util.ts:15-32`, `backend/src/kernel/shared/testing/money-keys.helper-spec.ts:6-21`

## Steps
1. Figures → `receivable-query.service.spec.ts` (real Postgres): an order total 10 000 000 with milestones 3 000 000 (invoiced 3 000 000, collected 1 000 000) and 2 000 000 (nothing) → `scheduled 5 000 000`, `unscheduled 5 000 000`, `invoiced 3 000 000`, `collected 1 000 000`, `receivable 2 000 000`, `toCollect 4 000 000`, states `partial`/`unpaid`; a voided collection or invoice changes none of them and still appears flagged in the page.
2. Filters: `dueState=overdue` returns only orders with a milestone `toCollect > 0` and `dueDate < today`; `upcoming` = `today ≤ dueDate ≤ today + 3` (edge dates today, yesterday, +3, +4 with a fake clock at 18:00Z, D-17); `balance=settled` needs `scheduled > 0` and `toCollect = 0`; `search` matches order code, customer and project accent-insensitively; ordering overdue first then earliest next due date; `page/limit/meta.total` correct; a cancelled order still listed with live `status: cancelled`.
3. `planned=no` returns open/in_production/delivered/completed orders with no plan, never one with a live milestone, never a cancelled one, within scope; an order whose only milestone was soft-deleted appears under `planned=no` and not under `planned=yes` (R-06); a plan whose order is missing from the hydrate (request row soft-deleted) is listed with `status: null`, no error (F-04, defensive spec).
4. Scope and roles (AC-05, AC-11): sales_a lists and opens only orders they currently own — after the order's request is reassigned to sales_b the old owner gets 404 and the new owner sees it (current owner, not snapshot); sales_b on sales_a's order → 404; accountant, director, admin, salesManager see all; technician, engineer, engineeringLead, purchasing, storekeeper, productionManager, qcInspector → 403 on both routes; `expectNoMoneyKeys` is not applied here (the payload is money by design, D-20) but a sales_b response body contains no data of sales_a's orders (assert ids).
5. Shaping (AC-19): the order page for sales_a (own order) and for salesManager holds no `note` key on any collection and no `voidReason` key on any voided row, while accountant, director and admin receive both; a recursive key walk proves absence at every depth, not null.
6. Validation: bad enum, `page=0`, `limit=101` → 400. OpenAPI and `api.ts` regenerated.

## Acceptance
- AC-05; AC-19 (`note`/`voidReason` omitted without `receivable:manage`); AC-11 (read routes, every role).

## Dependencies
- task-03-customer-invoices-collections.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/receivable/services/receivable-query.service.spec.ts && test -f src/plugins/accounting/receivable/services/receivable-scope.util.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"`
- Named probe: `receivable-query.service.spec.ts` (figures, filters, planned=no, clock edges, owner reassignment), `receivable-scope.util.spec.ts` (per-scope SQL), `receivable.controller.spec.ts` (403 per role, 400 validation), `order-finance.port.spec.ts` (`listUnplanned`)
- Reachability: known (same form as task-03).
- Oracle: exit 0, 0 skipped.
- Counterexample: using a snapshot owner instead of the current one must fail the reassignment case; counting voided rows in `invoiced` must fail the figures case; a `today + 4` milestone appearing as `upcoming` must fail the edge case; returning `note: null` instead of omitting it for sales must fail the shaping probe; counting a soft-deleted milestone in `scheduled` must fail the figures case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->

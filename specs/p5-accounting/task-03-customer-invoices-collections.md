# Task 03 — Customer invoices, collections and voids with the balance rules

Status: pending

## Outcome
An accountant records the customer invoices issued (number, date, amount) and the collections received (date, amount, method, note) per milestone; the system refuses over-invoicing and collecting more than the remaining balance; any of them can be voided with a reason; milestone edit/delete now respect live invoices and collections.

## Scope
- In (D-07, D-08, D-09, D-13, D-14): migration of `customer_invoices` (`milestone_id` FK, `order_id`, `invoice_no` ≤ 50, `invoice_date`, `amount numeric(18,0) > 0`, `voided_at/by`, `void_reason` ≤ 1000; partial unique `(lower(invoice_no)) WHERE voided_at IS NULL AND is_deleted = false`) and `customer_collections` (`milestone_id` FK, `order_id`, `client_request_id uuid NOT NULL`, partial unique `(client_request_id) WHERE is_deleted = false`, `collected_date`, `amount > 0`, `method` CHECK `cash|bank_transfer|other`, `note` ≤ 1000, void columns). Endpoints (`receivable:manage`): `POST /accounting/milestones/:id/invoices` `{invoiceNo, invoiceDate, amount}`, `POST /accounting/invoices/:id/void` `{reason}`, `POST /accounting/milestones/:id/collections` `{clientRequestId, collectedDate, amount, method, note?}`, `POST /accounting/collections/:id/void` `{reason}`. Inside every write: resolve the row's order id → `OrderFinancePort.lockForFinance` → data scope (404) → create paths: order `cancelled` → 409 (void paths allowed, D-13) → rules under the lock. Rules: invoice `amount` ≤ milestone amount − Σ live invoices (409 `Invoice exceeds the milestone amount (remaining: N)`); duplicate live `invoiceNo` → 409 `Invoice number already recorded` (the partial unique index is the backstop, unique violation translated to the same 409); collection `amount` ≤ Σ live invoices − Σ live collections of the milestone, else 409 **`Amount exceeds the remaining balance (remaining: N).`**; `invoiceDate`/`collectedDate` > `vnToday()` → 400; `collectedDate` before the earliest live invoice date of the milestone → 400 (F-05); `invoiceNo` is trimmed by the DTO and compared on `lower(invoice_no)` (R-08); a collection write locks the milestone row `FOR NO KEY UPDATE` after the order lock and, before any rule, looks the `clientRequestId` up: same body → the first record with 200 (the first call answers 201), different body → 409 `Request id already used`, missing/non-uuid → 400 (D-24); void invoice refused (409) when the milestone's collected would exceed its invoiced; void collection always allowed; a voided row is excluded from every sum and cannot be voided twice (409). Milestone guards added to `payment-milestone.service.ts`: PATCH amount (or percent) below live invoiced → 409; DELETE (soft) with a live invoice or live collection → 409, and with only voided children → 2xx without touching a foreign key. Only `receivable:manage` holders write: salesManager and sales get 403 on all five routes (user, Q11). Voids call the notice added by task-08 (director, D-22); this task writes no notice. Closing reminder notices is not done here (task-08 owns the notifier; this task only keeps the figures it will read).
- Out: lists and the order page (task-04); supplier side; reminders; screens.

## Coverage
- CP-03

## Ownership
- Create: `backend/src/plugins/accounting/receivable/database/migrations/<ts>-init-customer-invoices-collections.ts`, entities `customer-invoice.entity.ts`, `customer-collection.entity.ts`, `services/customer-invoice.service.ts` + `.spec.ts`, `services/customer-collection.service.ts` + `.spec.ts`, `services/receivable-balance-race.spec.ts`
- Modify: `backend/src/plugins/accounting/receivable/{receivable.controller.ts,receivable.controller.spec.ts,receivable.module.ts,receivable-db.helper-spec.ts}`, `services/payment-milestone.service.ts` (+ spec), dto, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/production/_shared/utils/vn-today.util.ts:15`, `backend/src/plugins/sales/_shared/ports/order-finance.port.ts`, `plugins/delivery/installation/database/migrations/1794845383917-init-installations.ts` (audit columns)

## Steps
1. Invoices → `customer-invoice.service.spec.ts` (real Postgres): invoice 60% of a milestone, then 50% → 409 (remaining shown); exact remaining → 2xx; duplicate number → 409 even when the first is on another order; a voided number can be reused; `invoiceDate` tomorrow (Vietnam) → 400, today → 2xx; at a fake 18:00Z clock the Vietnam date is already the next day (D-17); amount 0, −5, 2.5 → 400; cancelled order → 409 on create, void still 2xx.
2. Collections → `customer-collection.service.spec.ts`: no invoice yet → 409 `Amount exceeds the remaining balance (remaining: 0).`; after an invoice of 1 000 000, collect 400 000 then 700 000 → 409 `(remaining: 600000)` message exact; collect exactly the rest → 2xx and milestone `paid`; method `card` → 400; `collectedDate` future → 400; note > 1000 → 400; sales_b → 404 before any 409; sales_a (own order) → 403 (`receivable:read` only).
3. Voids: void a collection → balance reopens and a new collection up to it succeeds; void an invoice that has collections above the remaining invoiced → 409, below → 2xx; double void → 409; reason empty or > 1000 → 400; the row stays with `voided_at/by/reason` and is excluded from sums (SQL assertion).
4. Milestone guards: PATCH amount below live invoiced → 409; DELETE with a live collection → 409; after voiding all of them the DELETE answers 2xx (soft delete, no 500 from the invoice/collection foreign keys), the milestone leaves every total and its voided children stay readable by SQL.
5. Races → `receivable-balance-race.spec.ts` (`queuedBehind`, holder holds `sales_orders`): two collections each larger than half the remaining → exactly one 201; collection ∥ void-of-invoice → no state where collected > invoiced (assert after both settle); two invoices with one number → one 201, one 409; direct insert of a second live invoice with the same number → unique violation (backstop).
6. Idempotency and dates → `customer-collection.service.spec.ts`: the same `clientRequestId` and body twice → one row, the replay returns the first record (200 versus 201); replay of a collection that settled the milestone still answers 200 (lookup before the balance rule); same id with another amount → 409 `Request id already used`; missing or `not-a-uuid` → 400; a collection dated one day before the milestone's earliest live invoice → 400, the same day → 2xx; `INV-9` then ` inv-9 ` → 409 (trim and case).
7. Extra races (`receivable-balance-race.spec.ts`): PATCH amount below what a concurrent invoice creates ∥ create invoice → serialised, never `invoiced > amount`; DELETE ∥ collect on one milestone → exactly one outcome and no collection on a deleted milestone; parent-lock probe [UNVERIFIED until run]: a transaction holding the milestone row `FOR SHARE` (the reminder job's lock, task-08) makes a collection wait (`queuedBehind`) and it completes after release.
8. Controller spec: salesManager and sales (with `receivable:read`) → 403 on all five routes; technician, engineer, engineeringLead, purchasing, storekeeper, productionManager, qcInspector → 403 on all five routes; OpenAPI and `api.ts` regenerated.

## Acceptance
- AC-03; AC-18 (replay of a collection); AC-04 (customer side); AC-11 (invoice/collection routes); AC-16 (cancelled order refuses new invoice/collection, accepts voids).

## Dependencies
- task-02-accounting-plugin-payment-milestones.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/receivable/services/customer-invoice.service.spec.ts && test -f src/plugins/accounting/receivable/services/customer-collection.service.spec.ts && test -f src/plugins/accounting/receivable/services/receivable-balance-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"`
- Named probe: `customer-invoice.service.spec.ts` (bounds, duplicate, dates, Vietnam clock), `customer-collection.service.spec.ts` (exact 409 message, method, roles, replay, dates), `receivable-balance-race.spec.ts` (collection ∥ collection, collection ∥ void, invoice ∥ invoice, backstop), `receivable.controller.spec.ts` (403 per role)
- Reachability: known (same form as task-02; migration glob covers the feature directory).
- Oracle: exit 0, 0 skipped (the parent-lock probe is [UNVERIFIED] until this run).
- Counterexample: summing collected before the order lock must fail the collection ∥ collection race; counting voided rows in a sum must fail the void spec; using the UTC date for the "≤ today" bound must fail the 18:00Z case; dropping the partial unique index must fail the backstop; a hard milestone delete must fail the voided-children case; a replay lookup placed after the balance rule must fail the settled-replay case; letting salesManager write must fail the 403 probe.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->

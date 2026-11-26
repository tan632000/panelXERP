# Task 06 — Supplier payments against a supplier invoice, with voids

Status: pending

## Outcome
An accountant records manual payments (date, amount, method, note) against one supplier invoice; the system refuses paying more than the invoice's remaining due amount; a payment can be voided with a reason; a supplier invoice with a live payment cannot be voided.

## Scope
- In (D-12, D-09, D-13, D-14): migration of `supplier_payments` (`supplier_invoice_id` FK, `purchase_order_id`, `client_request_id uuid NOT NULL`, partial unique `(client_request_id) WHERE is_deleted = false`, `paid_date`, `amount numeric(18,0) > 0`, `method` CHECK `cash|bank_transfer|other`, `note` ≤ 1000, void columns). Endpoints (`payable:manage`): `POST /accounting/supplier-invoices/:id/payments` `{clientRequestId, paidDate, amount, method, note?}`, `POST /accounting/supplier-payments/:id/void` `{reason}`. Inside every write: resolve the PO id of the invoice/payment → `PurchaseOrderFinancePort.lockForPayable` → PO `cancelled` → 409 on create (void allowed) → invoice voided → 409 on create → `clientRequestId` lookup under the locks (same body → the first record with 200, the first call answers 201; different body → 409 `Request id already used`; missing/non-uuid → 400, D-24) → `paidDate` > `vnToday()` or before the supplier invoice's `invoiceDate` → 400 (F-05) → the supplier-invoice row is locked `FOR NO KEY UPDATE` after the PO lock (R-03) → `amount` > invoice amount − Σ live payments → 409 **`Amount exceeds the remaining balance (remaining: N).`** (same text as the customer side, D-08/D-12). Void payment: reason required, always allowed, second void 409. `supplier-invoice.service.ts` void now refuses (409) while the invoice has a live payment.
- Out: lists and PO page (task-07); reminders; screens.

## Coverage
- CP-06

## Ownership
- Create: `backend/src/plugins/accounting/payable/database/migrations/<ts>-init-supplier-payments.ts`, `entities/supplier-payment.entity.ts`, `services/supplier-payment.service.ts` + `.spec.ts`, `services/supplier-payment-race.spec.ts`
- Modify: `backend/src/plugins/accounting/payable/{payable.controller.ts,payable.controller.spec.ts,payable.module.ts,payable-db.helper-spec.ts}`, `services/supplier-invoice.service.ts` (+ spec), dto, `backend/docs/api/openapi.json`, `frontend/src/kernel/core/api/generated/api.ts`
- Read: `backend/src/plugins/accounting/receivable/services/customer-collection.service.ts` (the same balance contract), `backend/src/plugins/inventory/_shared/ports/purchase-order-finance.port.ts`

## Steps
1. Pay → `supplier-payment.service.spec.ts` (real Postgres): invoice 1 000 000, pay 400 000 then 700 000 → 409 with the exact message `(remaining: 600000)`; pay the rest → 2xx; `method` `card` → 400; `paidDate` tomorrow (Vietnam) → 400, today → 2xx; 18:00Z fake clock uses the Vietnam date (D-17); amount 0, −1, 1.5 → 400; payment on a voided invoice → 409; payment on a `cancelled` PO → 409; void a payment → the freed amount can be paid again; the PO's `payable` = invoiced − paid after each step (asserted by SQL here, by the API in task-07).
2. Idempotency and dates: the same `clientRequestId` and body twice → one row, replay 200 (also when the first payment settled the invoice); another amount under the same id → 409; missing/`not-a-uuid` → 400; `paidDate` the day before the invoice date → 400, the same day → 2xx; parent-lock probe [UNVERIFIED until run]: a transaction holding the supplier-invoice row `FOR SHARE` makes a payment wait (`queuedBehind`) and it completes after release.
3. Invoice void guard: void with a live payment → 409; after voiding the payment → 2xx.
4. Roles: every role except accountant/director/admin → 403 on both routes.
5. Race → `supplier-payment-race.spec.ts` (`queuedBehind`, holder holds `purchase_orders`): two payments each above half the due → exactly one 201; payment ∥ invoice void → never a live payment on a voided invoice (assert after both settle).
6. OpenAPI and `api.ts` regenerated.

## Acceptance
- AC-07 (payment rule, race); AC-18 (replay); AC-04 (payment void, invoice-void guard); AC-11 (payment routes); AC-16 (cancelled PO refuses a payment, accepts voids).

## Dependencies
- task-05-supplier-invoices.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/accounting/payable/services/supplier-payment.service.spec.ts && test -f src/plugins/accounting/payable/services/supplier-payment-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/accounting src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations"`
- Named probe: `supplier-payment.service.spec.ts` (exact 409 message, dates, voided invoice, cancelled PO, roles), `supplier-payment-race.spec.ts` (payment ∥ payment, payment ∥ invoice void), `supplier-invoice.service.spec.ts` (void guard)
- Reachability: known (same form as task-05).
- Oracle: exit 0, 0 skipped (the parent-lock probe is [UNVERIFIED] until this run).
- Counterexample: summing payments before the PO lock must fail the payment ∥ payment race; counting voided payments in the sum must fail the void-then-repay case; a differing message text must fail the exact-message probe; a replay lookup after the balance rule must fail the settled-replay case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
<!-- Fill only after execution; see canonical form below. -->

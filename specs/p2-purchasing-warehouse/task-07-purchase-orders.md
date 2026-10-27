# Task 07 — Purchase orders with one-step director approval

Status: pending

## Outcome
Purchasing drafts a PO for one supplier, submits it, a director who neither created, submitted nor edited it approves or rejects it (reject returns it to draft with the reason in its history), and purchasing can cancel or short-close it; storekeepers read the quantities without any price.

## Scope
- In: feature `inventory/purchase-order`. Header `code` `PO_YYYY_NNNN` via `createWithDocumentCode` imported from `@plugins/sales/_shared/utils/sales-document-code.util` (D-07; unique index, listed in `DOCUMENT_NUMBER_INDEXES` when the table extends `BaseEntity`), `supplier_id` → `suppliers` (active, else 409), `expected_date`, `vat_rate` ∈ {0,5,8,10}, `subtotal`, `vat_amount`, `total`, `note`, status per D-10, `created_by`, `editor_ids int[]` (every user who changed header or lines, since creation), `submitted_by/at`, `approved_by/at`, `cancel_reason`, `close_reason` + actor/time; history table `purchase_order_events` (event, actor, reason, at) recording submit/approve/reject/cancel/close. Lines: `item_id` → `items` (active), item code/name/unit snapshot, `quantity` > 0, `unit_price` ≥ 0 whole VND, `amount`, `received_qty` (net, written by tasks 11/13 under the header lock), `pr_line_id` NULL, `source_order_id` NULL (no FK, D-04).
- Transitions (header `FOR UPDATE`, write `WHERE status = :expected`): edit lines/header only in `draft` (adds the actor to `editor_ids`); `submit` (`purchase_order:submit`, ≥ 1 line); `approve`/`reject` (`purchase_order:approve`); actor ∈ {`created_by`, `submitted_by`} ∪ `editor_ids` → 403; reject needs a reason, returns to `draft` and records the reason in history (user, Q6); `cancel` (reason; `draft|pending_approval|approved` and Σ `received_qty` = 0); `close` (reason; `approved|partially_received`).
- Money: line `amount = round(qty × unit_price)`; subtotal Σ amounts; `vat_amount = round(subtotal × rate/100)`; half-up, `decimal.js`. Worked example: 10 × 100 000 = 1 000 000; 3 × 123 457 = 370 371; 2.5 × 33 333 = 83 332.5 → 83 333; subtotal 1 453 704; VAT 8 % = 116 296.32 → 116 296; total 1 570 000.
- AC-02: without `purchase_price:read` responses omit `unitPrice`, `amount`, `subtotal`, `vatAmount`, `total`, `vatRate` (D-19 helper).
- Reference checks (R-14): supplier delete veto (task-02 hook) — any PO references the supplier → 409; catalog item delete veto `registerItemCheck('inventory-purchase-order', …)` — an item on a PO line whose PO is not `cancelled` → 409.
- Notifications after commit: submit → role `director` (`inventory.purchase_order.submitted`, `requiredScope: purchase_order:approve`); approve/reject → the creator; event keys + labels in `frontend/src/kernel/core/hooks/api/useNotifications.ts`.
- Frontend `/inventory/purchase-orders`: list (status filter), editor (supplier picker, item picker, VAT), detail with history and submit/approve/reject/cancel/close actions gated by permission, status and the SoD rule, confirmation dialogs; price columns hidden without `purchase_price:read`.
- Out: receipts (11), PR conversion (15), PO PDF/e-mail, partial approval.

## Coverage
- CP-07

## Ownership
- Create: `backend/src/plugins/inventory/purchase-order/`, `frontend/src/plugins/inventory/purchase-order/`, `frontend/src/app/[locale]/inventory/purchase-orders/`
- Modify: `backend/src/plugins/inventory/supplier/` (veto registration), `inventory.features.ts`, `frontend/src/kernel/core/hooks/api/useNotifications.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `REF/backend/src/plugins/procurement/purchase-order/permissions/purchase-order-access.ts`, `backend/src/plugins/sales/_shared/utils/sales-document-code.util.ts`

## Steps
1. Entities/migration; pricing pure function + worked-example spec.
2. Lifecycle service + controller; history; notification emits after commit.
3. Specs: transitions table (each wrong-status call → 409); creator approves → 403; submitter approves → 403; a director who edited the draft (then another user submitted) approves → 403; purchasing approves → 403; reject → `draft` with the reason in history, edit + resubmit + approve by an uninvolved director → 200; storekeeper create → 403 and `expectNoMoneyKeys` on its list/detail; cancel after a receipt → 409 (fixture sets `received_qty`); supplier delete with a PO → 409; item delete on a draft and on an approved PO → 409, on a cancelled PO → allowed.
4. Real-Postgres: approve vs cancel via `Promise.all` → exactly one succeeds; 5 concurrent creates → 5 distinct codes.
5. Frontend + test (price columns hidden for a storekeeper; approve hidden for an editor).
6. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (PO), AC-04 (supplier and item vetoes), AC-10, AC-11.

## Dependencies
- task-06-estimate-stock-columns.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts` (SoD, race), `src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts` (worked example), frontend `src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres for race specs; permission-labels run proven in task-02.
- Oracle: worked-example totals exact; race exactly one fulfilled; codes distinct; real-DB specs 0 skipped.
- Counterexample: dropping the `editor_ids` check must fail the editor-approves spec; `Math.round` on floats must fail the 2.5 × 33 333 case.
- Artifacts: ephemeral; race rows removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

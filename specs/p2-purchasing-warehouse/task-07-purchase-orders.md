# Task 07 — Purchase orders with one-step director approval

Status: done

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
- Read: `backend/src/plugins/sales/_shared/utils/sales-document-code.util.ts` (the `REF/` access file once listed here is not in the repository; D-10 states the rule)

## Steps
1. Entities/migration; pricing pure function + worked-example spec.
2. Lifecycle service + controller; history; notification emits after commit.
3. Specs: transitions table (each wrong-status call → 409); creator approves → 403; submitter approves → 403; a director who edited the draft (then another user submitted) approves → 403; purchasing approves → 403; reject → `draft` with the reason in history, edit + resubmit + approve by an uninvolved director → 200; storekeeper create → 403 and `expectNoMoneyKeys` on its list/detail; cancel after a receipt → 409 (fixture sets `received_qty`); supplier delete with a PO → 409; item delete on a draft and on an approved PO → 409, on a cancelled PO → allowed.
4. Real-Postgres: approve vs reject via `Promise.all` → exactly one succeeds; approve vs cancel → cancelled, never approved after the cancel (history in order); an earlier submitter after a reject + unchanged resubmit approves → 403; supplier delete vs first PO create → never both; 5 concurrent creates → 5 distinct codes. (user 2026-10-28)
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
- Oracle: worked-example totals exact; approve/reject race exactly one fulfilled; approve/cancel race never approves a cancelled order; codes distinct; real-DB specs 0 skipped.
- Counterexample: dropping the `editor_ids` check must fail the editor-approves spec; `Math.round` on floats must fail the 1.005 × 100 case (the 2.5 × 33 333 product is exact in float and does not discriminate); an unlocked supplier delete must fail the supplier-delete race.
- Artifacts: ephemeral; race rows removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: e1947459e025e296ddd959fc193d9ed7331f8beb
Head: 189d127f9db750811bb0b0892d026edd4c9dcf7a71d338a01099112e49cea4f0
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
[seed-runner] All seeds completed.
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts
PASS src/plugins/catalog/item/item.controller.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/catalog/item/services/item-label.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/catalog/item/utils/code128.util.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts
Test Suites: 24 passed, 24 total
Tests:       309 passed, 309 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (32 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests)
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests)
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests)
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests)
 Test Files  4 passed (4)
      Tests  26 passed (26)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
Counterexamples (controller runs, reverted): dropping the `editor_ids` check failed `refuses a director who edited the draft even after someone else submitted it`; `Math.round` on floats failed the 1.005 × 100 vector (`expected "101", received "100"`) while the 2.5 × 33 333 case still passed (exact in float, see the Counterexample line); the unlocked supplier delete failed the supplier-delete race (`orderMade` and `supplierGone` both true). Reachability: after a restart, live `/api/v1/inventory/purchase-orders` answered purchasing and director 200 on the list and 404 past the guard on a create with an unknown supplier, storekeeper 200 on the list and 403 on create, sales 403 on both; the frontend routes could only be seen behind the login redirect (307 for every path), so the UI is proven by the component test and typecheck. Review: code-auditor PASS_WITH_WARNINGS (3 Medium) → user decided M1 (every past submitter barred) and M3 (AC-10 amended to D-10), M2 fixed in `supplier.service.ts` (locked check-and-delete); re-review PASS (0 Critical/High/Medium). Scope note: `supplier.service.ts` remove changed (Ownership allows `supplier/`); `_shared/inventory-db.helper-spec.ts` lists the new entities.

# Task 05 — Stock ledger, balances, low-stock alert and stock view

Status: done

## Outcome
Every stock change goes through one posting service that keeps per-item balances (on hand, reserved, available, value) and an append-only ledger, never goes negative, never deadlocks; storekeepers, purchasing and managers see stock and its movements, and purchasing is warned once when an item drops below its minimum.

## Scope
- In: feature `inventory/stock`. Tables per D-03: `stock_balances` (`item_id` PK → `items`, `on_hand`, `reserved`, `value` numeric(18,2) whole VND, `updated_at`); `stock_movements` (bigserial id, `item_id` → `items`, `movement_type` enum `receipt|issue|workshop_return|supplier_return|count_adjustment`, signed `quantity`, `unit_cost` numeric(18,4), signed `value`, `reference_value` numeric(18,2) NULL (PO receipt value of a supplier return, task-13), `on_hand_after`, `avg_cost_after` numeric(18,4), `document_type`, `document_id`, `document_line_id`, `order_id` / `order_line_id` without FK (D-04), `reason`, `created_by`, `created_at`); `stock_reservations` created here, written from task-10. CHECK constraints `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`, `value >= 0`, `on_hand > 0 OR value = 0`.
- `StockPostingService.post(manager, request)` — the only writer: locks balances then items per D-04 (ascending, creating missing balance rows), refuses a deleted item (409), applies each line with D-06 arithmetic and D-17 quantities (`decimal.js`; `avg = value / on_hand` 4 dp half-up; movement value whole VND half-up; an issue that empties the item takes the whole remaining value), refuses any D-03 breach with 409 naming the item (nothing persists), writes one movement per line, returns touched item ids. Reservation primitives are added in task-10.
- `StockAlertService.afterCommit(itemIds)` per D-15 low-stock half: `inventory.stock.low` to role `purchasing`, `requiredScope: stock:read`, dedupe `item:<id>`, emitted outside the transaction; recovery → `releaseDedupeKey`; failures logged only. Event key + label registered in `frontend/src/kernel/core/hooks/api/useNotifications.ts`.
- Item delete veto: `ReferenceCheckRegistry.registerItemCheck('inventory-stock', …)` (`backend/src/plugins/catalog/_shared/gateways/reference-check-registry.ts:16`) → true when the item has a movement or a balance row.
- Permissions declared: `stock:availability`, `stock:read`, `stock:ledger` (D-08; the availability endpoint itself is task-06). Read API: `GET /inventory/stock` (`stock:read`: item code/name/unit, default location, on hand, reserved, available, min stock, low flag; filters text, location, low only) and `GET /inventory/stock/:itemId/movements` (`stock:ledger`, paged). `avgCost`, `value`, `unitCost`, `referenceValue` only with `purchase_price:read` (AC-02, D-19).
- Frontend: `/inventory/stock` list + item ledger drawer (shown only with `stock:ledger`).
- Out: estimate columns and availability endpoint (06), documents that post (11–14), reservations logic (10).

## Worked example (D-06 oracle, one item, `min_stock` 12)
1. Receipt 10 @ 100 000 → +1 000 000; on hand 10, value 1 000 000, avg 100 000.0000.
2. Receipt 5 @ 130 000 → +650 000; on hand 15, value 1 650 000, avg 110 000.0000.
3. Issue 4 → −440 000; on hand 11, value 1 210 000 → available 11 < 12 → one `inventory.stock.low`.
4. Receipt 3 @ 123 457 → +370 371; on hand 14, value 1 580 371, avg 112 883.6429 → dedupe released.
5. Issue 2.5 → −round(2.5 × 112 883.6429) = −282 209; on hand 11.5, value 1 298 162, avg 112 883.6522 → a second notice.
6. Issue 12 → 409 "would leave −0.5", nothing written.
7. Issue 11.5 → −1 298 162 (whole remaining value); on hand 0, value 0; Σ movement values = 0 = balance value.
8. Decimal (D-17): receipt 0.1 then 0.2 @ 1 000, issue 0.3 → on hand exactly 0, value 0. Float vector: receipt 1.005 @ 100 → value 101 (JS float gives 100).

## Coverage
- CP-05

## Ownership
- Create: `backend/src/plugins/inventory/stock/` (entities, migration, `stock-posting.service.ts`, `stock-alert.service.ts`, `utils/stock-cost.util.ts`, permissions, controller, specs), `backend/src/plugins/inventory/_shared/inventory-db.helper-spec.ts`, `frontend/src/plugins/inventory/stock/`, `frontend/src/app/[locale]/inventory/stock/`
- Modify: `backend/src/plugins/inventory/inventory.features.ts`, `frontend/src/kernel/core/hooks/api/useNotifications.ts`, shared registration files
- Read: `backend/src/plugins/sales/quotation/quotation-db.helper-spec.ts` (real-Postgres helper pattern), `backend/src/kernel/core/audit/notification.service.ts:106-200`, `backend/src/kernel/shared/testing/money-keys.helper-spec.ts`

## Steps
1. Entities + migration with CHECK constraints.
2. Pure cost functions (`stock-cost.util.ts`) + worked-example spec (all 8 steps).
3. Posting service; real-Postgres specs: (a) 10 concurrent issues of 1 against on hand 5 → exactly 5 succeed, on hand 0, value 0; (b) postings touching {A,B} and {B,A} concurrently, 20 rounds → no "deadlock detected"; (c) a posting failing on its second line leaves the first line's balance unchanged; (d) direct `UPDATE … SET on_hand = -1` fails the CHECK; (e) after every spec, per item `Σ movements.value = balances.value` and `Σ movements.quantity = on_hand`.
4. Alert service + spec (once, release, re-raise; emit failure does not throw).
5. Read API: `expectNoMoneyKeys` on the storekeeper's stock list and movements; `sales` → 403 on both; item delete veto spec.
6. Frontend stock page + notification label; test: ledger drawer hidden without `stock:ledger`.
7. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (stock), AC-07, AC-08 (posting arithmetic), AC-09, AC-25 (posting half).

## Dependencies
- task-04-labels-scan-lookup.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-posting.service.spec.ts && test -f src/plugins/inventory/stock/services/stock-posting-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/stock src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stock/tests/stock-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/stock/utils/stock-cost.util.spec.ts` (worked example), `src/plugins/inventory/stock/services/stock-posting.service.spec.ts`, `src/plugins/inventory/stock/services/stock-posting-race.spec.ts` (real Postgres), `src/plugins/inventory/stock/services/stock-alert.service.spec.ts`, frontend `src/plugins/inventory/stock/tests/stock-list.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres reachable from the backend container (P1 race specs); permission-labels run proven in task-02.
- Oracle: exact worked-example figures; race (a) 5 fulfilled / 5 rejected 409; race (b) 0 deadlocks; invariant (e) holds; real-DB specs 0 skipped.
- Counterexample: locking balances in input order must make race (b) report a deadlock; JS `number` arithmetic must fail step 8 (value 100 instead of 101; on hand 5.55e-17 instead of 0).
- Artifacts: race specs use a unique item-code prefix and delete their rows in `afterAll`.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-posting.service.spec.ts && test -f src/plugins/inventory/stock/services/stock-posting-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/stock src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stock/tests/stock-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 1ef1939acdb771a153ed0f4c70ef34c00b66b72b
Head: a7fd117bcce3af3de9192809e84d78c58d2e070c34cc58ffd4dcf1c6621aa277
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-posting.service.spec.ts && test -f src/plugins/inventory/stock/services/stock-posting-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory/stock src/plugins/catalog/item src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/stock/tests/stock-list.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/kernel/core/hooks" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
[seed-runner] All seeds completed.
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts
PASS src/plugins/catalog/item/item.controller.spec.ts
PASS src/plugins/catalog/item/services/item.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/catalog/item/services/item-label.service.spec.ts
PASS src/plugins/catalog/item/services/item-stock-settings.service.spec.ts
PASS src/plugins/catalog/item/utils/item-identifier-lock.spec.ts
PASS src/plugins/catalog/item/services/item-import.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/catalog/item/utils/code128.util.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
Test Suites: 18 passed, 18 total
Tests:       245 passed, 245 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (31 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests)
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests)
 Test Files  2 passed (2)
      Tests  10 passed (10)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests)
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
Counterexample (controller run, reverted): locking balances one row at a time in input order made race (b) fail with `deadlocked(results)` = true; the ascending lock passes. Review: code-auditor PASS (0 Critical/High/Medium, 6 Low).

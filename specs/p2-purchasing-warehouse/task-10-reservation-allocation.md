# Task 10 — Reserve on order create, release on cancel, auto-allocation and shortage alerts

Status: pending

## Outcome
Creating an order reserves available stock for its BOM demand in the same transaction, cancelling releases it to other short orders, any stock increase is allocated by the D-05 priority, and purchasing plus the sales owner are told once when an order is short — and released when any order's shortage reaches 0, whichever order's change caused it.

## Scope
- In (sales): `backend/src/plugins/sales/_shared/ports/order-lifecycle-registry.ts` — synchronous registry like `request-close-registry.ts:33`: `register(name, { onCreated?, onCancelled?, afterCommit? })`; `onCreated`/`onCancelled` return `{ changedOrderIds, touchedItemIds }`. Per D-04 the hooks run at the **end** of the transaction: in `OrderConvertService.convert` after `copyLines`, the request `won` advance and the request activity (`order-convert.service.ts:160-170`); in `OrderEditService.cancel` after `moveOpenOrder`, the request `lost` advance/save and the activity (`order-edit.service.ts:101-122`). `afterCommit(result)` runs after the transaction, outside `createWithDocumentCode`'s retried work. A handler failure aborts the convert/cancel.
- In (inventory `material`): `ReservationService` (D-05, D-17):
  - `reserveForOrder(manager, orderId)`: per linked item ascending, lock balances (D-04), reserve `min(available, shortage)`.
  - `releaseOrder(manager, orderId)`: lock the balances of **every linked BOM item of the order ∪ every item it currently reserves**, ascending `item_id`, then delete its reservations, then `allocate` those items. Locking only reserved items is wrong: an order short of X with 0 reservation would not take X's lock, so a concurrent receipt could allocate X to it after the cancel read its reservations.
  - `allocate(manager, itemIds, preferOrderIds = [])`: candidates = `open` orders with shortage > 0 for the item (via `OrderMaterialReadPort`), preferred first, delivery date ascending (NULL last), order id ascending; gives `min(remaining available, shortage)`.
  - `deallocate(manager, itemId, targetReserved)`: shrinks reservations in exactly the reverse order until `reserved ≤ target`.
  - Every method returns the ids of all orders whose reservation changed; callers already hold the balance rows. `StockPostingService` gains reservation consumption for issues (used in task-12) and keeps `reserved = Σ reservations`.
- `ShortageAlertService.afterCommit(orderIds, itemIds)` per D-15 for every changed order: total shortage > 0 → `inventory.order.short` (role `purchasing`, `requiredScope: material:read`, dedupe `order:<id>`) and `inventory.order.short.owner` (user = sales owner, dedupe `order:<id>`); shortage 0 → `releaseDedupeKey` both; cancelled → `close` both; then the task-05 low-stock check for the touched items (reservations change available stock). Event keys + labels in `frontend/src/kernel/core/hooks/api/useNotifications.ts`.
- P1 e2e cleanup: `backend/test/sales-chain.e2e-spec.ts` now creates reservations and balance rows; its cleanup deletes `stock_reservations`, `stock_movements`, `stock_balances` of its own items.
- Out: receipts calling `allocate` (11), issues consuming reservations (12).

## Worked example (one item X, on hand 10)
1. Create O1 (delivery 2026-11-05, demand 6) → O1 6; O2 (2026-11-10, demand 6) → O2 4, short 2; O3 (no date, demand 4) → O3 0, short 4. Purchasing gets one notice each for O2 and O3; each owner one.
2. Increase +5 (fixture posting) then `allocate([X])` → O2 +2 (short 0, its notices released), O3 +3 (short 1); available 0.
3. Cancel O1 → release 6 → O3 +1 (short 0): `onCancelled` returns `changedOrderIds` = {O1, O3}; O1's notices closed **and O3's notices released**; available 5.
4. Decimal (D-17): item Q, per-panel 0.1 × 3 panels on order O4, on hand 0 → short 0.3, notices raised; postings +0.1 and +0.2 each followed by `allocate` → reserved exactly 0.3, shortage 0, notices released.

## Coverage
- CP-10

## Ownership
- Create: `backend/src/plugins/sales/_shared/ports/order-lifecycle-registry.ts` (+ spec), `backend/src/plugins/inventory/material/services/{reservation,shortage-alert}.service.ts` (+ specs), `backend/src/plugins/inventory/material/services/reservation-race.spec.ts`
- Modify: `backend/src/plugins/sales/order/services/order-convert.service.ts`, `backend/src/plugins/sales/order/services/order-edit.service.ts`, their constructor-building specs `backend/src/plugins/sales/order/services/order-convert.service.spec.ts` and `backend/src/plugins/sales/order/order.controller.spec.ts`, `backend/src/plugins/sales/_shared/sales-shared.module.ts`, `backend/src/plugins/inventory/stock/services/stock-posting.service.ts`, `backend/test/sales-chain.e2e-spec.ts` (cleanup), `frontend/src/kernel/core/hooks/api/useNotifications.ts`
- Read: `backend/src/plugins/sales/_shared/ports/request-close-registry.ts`

## Steps
1. Registry + wiring at the end of convert/cancel; spec: a throwing handler rolls back the order and its request `won`.
2. Reservation service + worked-example spec (exact reservations and returned `changedOrderIds` after each step).
3. Real-Postgres races: (a) two orders each demanding 8 of on hand 10 created concurrently → Σ reserved = 10, one has 8; (b) O5 short of X with 0 reservation of X; cancel of O5 ∥ a +5 posting of X with `allocate` → O5 ends with 0 reservations and `reserved = Σ reservations`, 10 rounds; (c) convert of order A and cancel of order B sharing items {X, Y} in opposite BOM order, 10 rounds → no deadlock; (d) deterministic (P1 task-11 `pg_blocking_pids` pattern): while a test transaction holds balance row X `FOR UPDATE`, a cancel of an order with X in its BOM but no reservation of X blocks on that backend.
4. Shortage alert spec (once per order and owner; release; close on cancel; step 3: O3's notices released by O1's cancel; step 4 decimal case).
5. Frontend notification types + test.

## Acceptance
- AC-14, AC-15, AC-25 (demand half).

## Dependencies
- task-09-material-view.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/material/services/reservation.service.spec.ts && test -f src/plugins/inventory/material/services/reservation-race.spec.ts && test -f src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory src/plugins/sales/order src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- --ci sales-chain" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/material/tests/shortage-notification.test.ts && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/material src/kernel/core/hooks"`
- Named probe: `src/plugins/inventory/material/services/reservation.service.spec.ts` (worked example), `src/plugins/inventory/material/services/reservation-race.spec.ts` (races a–d), `src/plugins/inventory/material/services/shortage-alert.service.spec.ts`, `src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts`, `test/sales-chain.e2e-spec.ts`, frontend `src/plugins/inventory/material/tests/shortage-notification.test.ts`
- Reachability: compose Postgres; e2e mapper proven in P1.
- Oracle: worked-example reservations and notices exact; race (a) Σ = 10; (b) O5 0 in every round; (c) 0 deadlocks; (d) blocked as stated; real-DB and e2e specs 0 skipped.
- Counterexample: locking only currently reserved items in `releaseOrder` must fail race (b)/(d); returning only the cancelled order id must leave O3's notice open and fail step 3; reserving after commit must fail the rollback spec; JS float sums must fail step 4.
- Artifacts: ephemeral; fixtures and e2e rows removed by unique prefix and own ids.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

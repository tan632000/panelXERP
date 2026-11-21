# Task 07 — Sales and inventory deltas for delivery

Status: done

## Outcome
Sales offers the delivery plugin a site address read, three new order-change kinds and an `onDelivered` lifecycle hook; when an order becomes `delivered`, inventory gives its remaining reservations to other short orders and closes its shortage notices; workshop returns are accepted for `delivered` and `completed` orders in the API and the inventory screens, while issuing stays refused.

## Scope
- In (sales `_shared`, D-09/D-10): `order-production.port.ts` gains `siteAddress(manager, orderId)` (project `site_address` via `sales_orders.project_id → projects`, else `sales_orders.customer_address`, else null); `order-follower-notifier.ts` `OrderChange` (`:14-20`) gains `delivery_received`, `delivered`, `completed`; `order-lifecycle-registry.ts` gains `onDelivered` and `delivered(manager, event)` on the same `run` path (`:61-73`).
- In (inventory): (user, Q6) `reservation.service.ts` registers `onDelivered` → `releaseOrder` (`:55-70,116-150`), returning changed orders and touched items like `onCancelled`; (R-08) `shortage-alert.service.ts` closes `inventory.order.short` and `.owner` for an order whose status is `cancelled`, `delivered` or `completed` (`:90-97`); (user, Q9) `RETURNABLE_ORDER_STATUSES` gains `delivered`, `completed` in `backend/src/plugins/inventory/issue/constants/issue.constant.ts:26-30` and `frontend/src/plugins/inventory/_shared/order-status-gates.ts:17-21` (consumers `WorkshopReturnScreen.tsx:63`, `OrderMaterialPage.tsx:198-199` follow the list); `ISSUABLE_ORDER_STATUSES` unchanged.
- Out: the delivery endpoints that call these (task-08, task-11).

## Coverage
- CP-07

## Ownership
- Modify: `backend/src/plugins/sales/_shared/ports/order-production.port.ts` (+ `order-production.port.spec.ts`), `sales/_shared/ports/order-lifecycle-registry.ts` (+ `order-lifecycle-registry.spec.ts`), `sales/_shared/services/order-follower-notifier.ts`, `backend/src/plugins/inventory/material/services/reservation.service.ts` (+ `reservation.service.spec.ts`), `inventory/material/services/shortage-alert.service.ts` (+ `shortage-alert.service.spec.ts`), `backend/src/plugins/inventory/issue/constants/issue.constant.ts` (+ `inventory/issue/services/workshop-return.service.spec.ts`), `frontend/src/plugins/inventory/_shared/order-status-gates.ts` (+ `frontend/src/plugins/inventory/_shared/tests/order-status-gates.test.ts`)
- Read: `backend/src/plugins/sales/order/services/order-edit.service.ts:92-135` (move → hook → afterCommit), `order-convert.service.ts:174-183`

## Steps
1. Port → `order-production.port.spec.ts`: `siteAddress` returns the project's address, then the order's customer address, then null.
2. Registry → `order-lifecycle-registry.spec.ts`: `delivered()` runs every `onDelivered`, a throwing hook rejects, `afterCommit` runs each handler's follow-up once.
3. Reservation → `reservation.service.spec.ts` (real Postgres): order A (earliest delivery date) holds a reservation of X, order B is short of X; after A moves to `delivered` and `lifecycle.delivered()` runs in the same transaction, A holds 0 reservations and B received the freed quantity.
4. Shortage → `shortage-alert.service.spec.ts`: an open shortage notice of an order that became `delivered` is closed on evaluation; same for `completed`.
5. Returns (user, Q9) → `workshop-return.service.spec.ts`: return to a `delivered` and to a `completed` order → 201; issue to a `delivered` order → refused as today; frontend `order-status-gates.test.ts`: `isReturnableOrder('delivered'|'completed')` true, `isIssuableOrder('delivered')` false.

## Acceptance
- AC-08 (reservation release and shortage closing half); AC-16.

## Dependencies
- task-06-qc-screens.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/sales/_shared src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- inventory-chain sales-chain production-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"`
- Named probe: `order-production.port.spec.ts` (`siteAddress`), `order-lifecycle-registry.spec.ts` (`onDelivered`), `reservation.service.spec.ts` (delivered release), `shortage-alert.service.spec.ts` (delivered/completed close), `workshop-return.service.spec.ts` (Q9), `order-status-gates.test.ts`; P1–P3 e2e regression
- Reachability: known (all specs exist today and run under these folders; e2e patterns as P3 task-08).
- Oracle: exit 0, 0 skipped, three e2e suites passed.
- Counterexample: registering `onDelivered` without calling `releaseOrder` must fail the reservation spec; adding `delivered` to `ISSUABLE_ORDER_STATUSES` must fail the issue-refused case.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/sales/_shared src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- inventory-chain sales-chain production-chain" && docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"
Exit: 0
Base: e956871466224130d58c22725a47950b53594860
Head: 17094778c2a34ecb21ca2b0e53355d4939cc25f7a589c87954179dad08a2b300
```text
$ docker compose exec -T backend sh -c "npm run lint && ... && npm run test:e2e -- inventory-chain sales-chain production-chain"
> eslint "{src,apps,libs,test}/**/*.ts" --max-warnings=0
No migrations are pending
PASS src/plugins/sales/_shared/ports/order-production.port.spec.ts
PASS src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/inventory/issue/services/workshop-return.service.spec.ts (22.48 s)
Test Suites: 43 passed, 43 total
Tests:       385 passed, 385 total
> jest --config ./test/jest-e2e.json inventory-chain sales-chain production-chain
PASS test/inventory-chain.e2e-spec.ts (37.751 s)
PASS test/production-chain.e2e-spec.ts (58.029 s)
PASS test/sales-chain.e2e-spec.ts (35.879 s)
Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
$ docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (13 tests)
 ✓ src/plugins/inventory/issue/tests/workshop-return-screen.test.tsx (5 tests)
 ✓ src/plugins/inventory/_shared/tests/order-status-gates.test.ts (2 tests)
 Test Files  14 passed (14)
      Tests  84 passed (84)
```
Skipped: none reported in either log. Counterexamples (each run once against a temporary mutation of the named spec, reverted afterwards; worktree Head `17094778…b300` identical before and after both): `onDelivered` returning an empty result instead of calling `releaseOrder` failed `reservation.service.spec.ts` "gives a delivered order reservation to the order that is short, through the delivered hook" (1 failed, 6 passed); adding `delivered` to the backend `ISSUABLE_ORDER_STATUSES` failed `workshop-return.service.spec.ts` "accepts returns to a delivered and to a completed order, and still refuses issuing to them" (1 failed, 3 passed).
Review: code-auditor PASS (0 critical/high/medium). Low, left as is: the refusal text at `workshop-return.service.ts:163` still lists only open/cancelled (outside Ownership, no spec reads it); `siteAddress` does not filter a soft-deleted project (unspecified, to confirm in task-08); `deliver()` in the spec kit matches the "already registered" message by string.
Deviations from Ownership: three tests that asserted the superseded rule "a delivered order refuses returns" were flipped to the accepted Q9 rule — `backend/src/plugins/inventory/issue/services/issue.service.spec.ts` (return to a delivered order now 201, net issued 0), `frontend/src/plugins/inventory/issue/tests/workshop-return-screen.test.tsx` (the "refuses a delivered order" case removed: no order status is refused any more; delivered and completed now render the form), `frontend/src/plugins/inventory/material/tests/order-material.test.tsx` (a delivered or completed order offers only the workshop return); `backend/src/plugins/inventory/material/reservation-db.helper-spec.ts` gained `deliver()` (move to delivered, run `lifecycle.delivered`, then the after-commit follow-up) for Step 3 and 4. Not run before editing: the pre-change run of the Command (Docker Desktop was off at the start); the new specs were therefore not seen failing before the change, only under the two mutations above.
Docs impact: none yet (no user-facing endpoint calls `delivered()` until task-08; docs are task-14).

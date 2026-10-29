# Task 13 — Return to supplier against a PO

Status: done

## Outcome
A storekeeper returns received goods to the supplier against the PO line they came on; stock leaves at that PO price, the PO's received quantity drops (so replacements can be received unless the PO is closed), and reservations shrink if stock no longer covers them.

## Scope
- In: feature `inventory/supplier-return`, code `XT_YYYY_NNNN`; header (`purchase_order_id`, `reason` required, `request_key` unique NULL, `created_by`, `created_at`); lines (`po_line_id`, `item_id`, `quantity`, `unit_cost` = PO line `unit_price`, `value`, `reference_value` = round(q × PO line unit price)). `POST /inventory/supplier-returns` (`stock_return:create`):
  1. `createWithDocumentCode` tx; a stored `requestKey` → the original, 200.
  2. PO header `FOR UPDATE`, then **immediately** insert the return header with `request_key` (D-18, before any validation or balance lock; a concurrent twin fails on the `request_key` index → rollback → original read back, 200); then status `partially_received|received|closed` (else 409).
  3. Each line `quantity ≤ received_qty` of its PO line (`decimal.js`, 409); `received_qty −= quantity`; `received → partially_received` (`WHERE status = :expected`); `closed` stays `closed` and, per D-11, its incoming stays 0 — a return on a closed PO never creates expected incoming stock.
  4. Lock balances; `quantity > on_hand` → 409; post `supplier_return` per D-06 (user 2026-10-27): the movement stores `reference_value` (the PO receipt value) and, when the return brings `on_hand` to 0, takes the whole remaining value (movement value = −value); otherwise `value' = max(0, value − reference_value)` and movement value = `value' − value`. The difference `|movement value| − reference_value` stays visible for P5 supplier-payable reconciliation; `reference_value` is a money key (D-19) shown only with `purchase_price:read`; when `on_hand < reserved`, `ReservationService.deallocate` to `on_hand` in reverse D-05 priority.
  5. After commit: low-stock and shortage alerts (orders that lost reservations).
- Reads: list/detail (`stock_return:read`); D-19 money keys only with `purchase_price:read` (AC-02). PO detail shows its returns.
- Frontend: "Trả NCC" from a PO detail: lines with net received, `ScanInput` to pick the line by item, quantity, reason; posts once with a `requestKey`.
- Out: supplier credit notes / payables (P5), returns without a PO.

## Worked example (X: PO1 10 @ 100 000 and PO2 5 @ 130 000 fully received → on hand 15, value 1 650 000; O1 (2026-11-05) reserved 8, O3 (no date) reserved 6)
1. Return 3 on PO2's line → movement value −390 000, reference value 390 000; value 1 260 000, on hand 12, avg 105 000.0000; reserved 14 > 12 → O3 (lowest priority) −2 → O3 short 2 → O3 shortage notices; PO2 `partially_received`, received 2.
2. Return 3 more on PO2's line → 409 (net received 2).
3. Receive 3 again on PO2 (task-11 path) → allowed; PO2 `received`.
4. Last unit, PO cost below the remaining value (user vector): item Y receives 1 @ 100 000 on PO1 and 1 @ 200 000 on PO2 → on hand 2, value 300 000, avg 150 000; issue 1 → −150 000, on hand 1, value 150 000; return 1 to PO1 → movement value −150 000 (whole remaining value), reference value 100 000; on hand 0, value 0, CHECK `on_hand > 0 OR value = 0` satisfied, Σ movement values of Y (+100 000 + 200 000 − 150 000 − 150 000) = 0 = balance value.
5. Last unit, PO cost above the remaining value (symmetric): same Y history but return the last unit to PO2 → movement value −150 000, reference value 200 000; on hand 0, value 0; Σ = 0.
6. Partial return clamp: item W on hand 2, value 100 000 (PO line price 130 000) → return 1 → value' = max(0, 100 000 − 130 000) = 0, movement value −100 000, reference value 130 000; on hand 1, value 0 (CHECK satisfied); a later issue of the last W takes value 0; Σ movement values of W = 0 = balance value.
7. PO3 `closed` after receiving 2 of 6: return 1 → received 1, PO3 stays `closed`, a receipt on PO3 → 409.

## Coverage
- CP-13

## Ownership
- Create: `backend/src/plugins/inventory/supplier-return/`, `frontend/src/plugins/inventory/supplier-return/`
- Modify: `backend/src/plugins/inventory/stock/services/stock-posting.service.ts` and `backend/src/plugins/inventory/stock/utils/stock-cost.util.ts` (+ `stock-cost.util.spec.ts`) for the supplier-return branch of D-06 (last unit takes the remaining value, clamp, `reference_value`), `backend/src/plugins/inventory/purchase-order/` (status recompute both ways, returns on detail), `frontend/src/plugins/inventory/purchase-order/components/` (return entry), `inventory.features.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `backend/src/plugins/inventory/material/services/reservation.service.ts` (`deallocate`)

## Steps
1. Entity/migration; service per the five sub-steps.
2. Specs: worked example exact, including the three last-unit/clamp vectors (steps 4–6) with `reference_value` and the per-item invariant Σ movement values = balance value; PO `approved` with nothing received → 409; `expectNoMoneyKeys` on the storekeeper's responses (incl. `referenceValue`), including `GET /inventory/stock/:itemId/movements` for Y after the step-4 supplier return (the ledger endpoint is the one place `reference_value` is stored and would reveal the PO unit price).
3. Real-Postgres races: (a) a supplier return and a receipt on the same PO concurrently keep `received_qty` = Σ receipts − Σ returns and never exceed ordered; (b) a supplier return concurrent with an issue of the same item never leaves `on_hand < 0` or `reserved > on_hand`; (c) boundary fixture — the PO line's net received is exactly the returned quantity (2): two posts of 2 with the same `requestKey` via `Promise.all` → both 200/201 with the same id and one set of movements (validation run before the header insert would give the twin 409 and fail).
4. Frontend + test.
5. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (returns), AC-08 (supplier return cost), AC-19, AC-26.

## Dependencies
- task-12-issue-workshop-return.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"`
- Named probe: `src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts` (worked example + races a–c), frontend `src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx`
- Reachability: compose Postgres.
- Oracle: worked-example figures exact; invariants hold after races; real-DB specs 0 skipped.
- Counterexample: valuing the return at the current average must give avg 110 000 in step 1; deallocating by forward priority must take from O1; valuing the last unit of step 4 at the PO cost (−100 000) must leave value 50 000 with on hand 0 and fail the CHECK (409); inserting the header after validation must fail race (c).
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"
Exit: 0
Base: ca3cea2e8246d491eada0d5737e0540d41831165
Head: 4e3757c97ec3a75b0ea75fbc2e35e55773961b8311508350e5126faea469619b
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (21.024 s)
PASS src/plugins/inventory/issue/services/issue-race.spec.ts (21.839 s)
PASS src/plugins/inventory/issue/services/workshop-return.service.spec.ts (23.854 s)
PASS src/plugins/inventory/supplier-return/services/supplier-return.service.spec.ts (25.261 s)
PASS src/plugins/inventory/stock/stock.controller.spec.ts (9.275 s)
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (9.583 s)
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (31.647 s)
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (11.876 s)
PASS src/plugins/inventory/issue/services/issue.service.spec.ts (7.108 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (6.385 s)
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (5.87 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (15.801 s)
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/material/services/reservation-race.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (6.124 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (5.987 s)
Test Suites: 28 passed, 28 total
Tests:       235 passed, 235 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (36 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 4726ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests) 534ms
 ✓ src/plugins/inventory/supplier-return/tests/supplier-return-form.test.tsx (3 tests) 906ms
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests) 1528ms
 ✓ src/plugins/inventory/issue/tests/issue-screen.test.tsx (6 tests) 2613ms
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 1340ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 37ms
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests) 29ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (4 tests) 457ms
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests) 544ms
 Test Files  9 passed (9)
      Tests  48 passed (48)
EXIT=0
```

Negative proof (each counterexample applied alone, supplier return spec rerun, files restored byte-for-byte):
- the return valued at the current average → step 1 fails (avg 110 000 instead of 105 000).
- deallocation in forward priority → step 1 fails (O1 instead of O3 gives back 2).
- the last unit valued at its PO cost → step 4 fails (value 50 000 left with nothing on hand).
- the header inserted after the received check → race (c) fails (the twin gets 409).

Reachability: backend restarted; `SupplierReturnModule dependencies initialized`, `Mapped {/api/v1/inventory/supplier-returns, GET}`, `{/api/v1/inventory/supplier-returns/:id, GET}`, `{/api/v1/inventory/supplier-returns, POST}`, `Nest application successfully started`. Frontend route `/inventory/supplier-returns/new`, the "Trả NCC" action and the returns history on the purchase order page.

Review: code-auditor PASS (0 Critical / 0 High / 0 Medium); Lows recorded for GATE-DONE.

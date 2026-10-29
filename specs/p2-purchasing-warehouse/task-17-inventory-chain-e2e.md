# Task 17 — Purchasing and warehouse chain proven end-to-end over HTTP

Status: done

## Outcome
One HTTP test against the real application and compose Postgres drives order → shortage → PR → PO → approval → receipt → allocation → issue → workshop return → estimate-vs-actual with the seeded demo roles, and checks the price and scope boundaries on every P2 read on the way.

## Scope
- In: `backend/test/inventory-chain.e2e-spec.ts` (AppModule, like `backend/test/sales-chain.e2e-spec.ts`), logging in as the demo users (`director`, `sales_a`, `sales_b`, `eng_lead`, `engineer_a`, `purchasing`, `storekeeper`):
  1. Setup through the API: supplier, location, two items (X with `min_stock` 2, Y), opening balance by a stock count of X = 3 (storekeeper counts and submits, director approves).
  2. P1 chain to an order for `sales_a` whose BOM needs X 5 and Y 2 → reservation X 3; material view short X 2, Y 2; purchasing and `sales_a` each get one `inventory.order.short*` notice.
  3. `purchasing` raises a PR from the order's shortage (X 2, Y 2), converts it into a draft PO for the supplier and adds a manual line X 1 (no source order); `purchasing` approve → 403; `director` approves.
  4. `storekeeper` reads the PO without any price key; receives X 1 and Y 2 (partial, PO `partially_received`, both go to the order as source); then X 2 → PO `received`, the order's shortage reaches 0, its notice slots are released and X available is 1; one more X → 409 (over-receipt).
  5. `storekeeper` issues X 5 and Y 2 to the order (reservations consumed to 0); then X 1 without reason → 400, with reason "thay thế" → 201 (X on hand 0). X's available stays below `min_stock` 2 from the order's reservation in step 2 onwards, so purchasing holds exactly one `inventory.stock.low` for X during the whole run.
  6. Workshop return X 1 → X on hand 1, order net issued X 5 = demand, no re-reservation; estimate-vs-actual shows X estimated 5 / actual 5 and the over-BOM line with its reason; `sales_b` → 404 on the material view and the order is absent from `sales_b`'s material list; `engineer_a` → 403 on the material view and on `/inventory/stock`, 200 on `/inventory/stock/availability`.
  7. Money keys (D-19, `expectNoMoneyKeys`) on every response served to `storekeeper`: `/items` (list, detail, resolve), `/inventory/stock`, `/inventory/stock/:itemId/movements`, purchase orders, receipts, issues, workshop returns, stock count, material view (list, detail, estimate-vs-actual); and to `sales_a`/`engineer_a` on availability and the material view.
  8. Ledger: per item Σ movement quantities = `on_hand`, Σ movement values = balance `value`, `reserved = Σ reservations`.
- Out: browser walkthrough (left to GATE-DONE, as in P1).

## Coverage
- CP-17

## Ownership
- Create: `backend/test/inventory-chain.e2e-spec.ts`
- Modify: none outside the test (a defect found here is fixed in the owning task's files and noted in the receipt)
- Read: `backend/test/sales-chain.e2e-spec.ts`, `backend/test/jest-e2e.json`, `backend/src/kernel/shared/testing/money-keys.helper-spec.ts`

## Steps
1. Write the test with a unique code prefix and session cleanup by its own ids (P1 task-11 pattern).
2. Assert the expected on hand, reserved and available of X and Y after every step listed in Scope (opening 3 → reserve 3 → +1 → +2 → issue 5 → issue 1 → return 1).
3. Run against the compose stack after migrate + seed + `docker compose restart backend` (Docker watch does not reload on this host).

## Acceptance
- AC-02 (end-to-end), AC-24.

## Dependencies
- task-16-estimate-vs-actual.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f test/inventory-chain.e2e-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- --ci inventory-chain sales-chain"`
- Named probe: `test/inventory-chain.e2e-spec.ts` (and `test/sales-chain.e2e-spec.ts` as regression)
- Reachability: `test:e2e` mapper proven in P1 task-01/11; e2e DB = compose Postgres; demo users seeded by this Command.
- Oracle: both e2e suites pass with 0 skipped; the listed status codes, quantities, money-key checks and ledger invariants hold.
- Counterexample: a PO response that includes `unitPrice` for the storekeeper, or a reservation left on the order after its shortage is filled by issue, must fail the test.
- Artifacts: e2e rows removed by unique prefix and own ids; notifications created by the run removed.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f test/inventory-chain.e2e-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- --ci inventory-chain sales-chain"
Exit: 0
Base: eb43e00f8af5d2fae97b3ad6302a93a711b3413f
Head: d91bd91ad97f50b1db21b2435ec871cd5a06458f0b5be303b652d21df9e0348d
```text
$ docker compose exec -T backend sh -c "test -f test/inventory-chain.e2e-spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run test:e2e -- --ci inventory-chain sales-chain"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
[seed-runner] Scope: all (NODE_ENV=development)
[seed-runner] Running core seeds...
[seed:users] 0 users created, 10 already existed and were left untouched (domain: example.com)
[seed-runner] Core seeds done.
[seed-runner] Running plugin seeds...
[seed-runner] All seeds completed.
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (17.329 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (17.44 s)
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (18.446 s)
Test Suites: 6 passed, 6 total
Tests:       65 passed, 65 total
> panelxerp-backend@0.0.1 test:e2e
PASS test/sales-chain.e2e-spec.ts (25.588 s)
PASS test/inventory-chain.e2e-spec.ts (27.207 s)
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
EXIT=0
```

Rebound after a later change outside this task's scope (fixes made at the user's request during the GATE-DONE walkthrough: the shared detail-page layout scroll, the request timeline labels, the supplier-return route entry, the notification scope test, the lone-zero number input and the quotation submit guard): the exact Command was rerun on the current tree and the output above is that run's.

Negative proof (each counterexample applied alone, the inventory-chain e2e rerun, file restored byte-for-byte):
- PO lines served to the storekeeper with their prices → fails, listing `$.lines[0..2].unitPrice` and `.amount`.
- an issue that does not consume the order's reservation → the BOM issue answers 409 and the test fails; a full take that leaves the reservation row → 500 and the test fails.
- the earlier price-only edit rule for a PO made from requests → the e2e and the purchase-request spec fail with 409 on the edit.

Defect fixed in the owning task's files (task-15, `purchase-order.service.ts`): a draft PO made from purchase requests answered 409 to any line change, stricter than task-15's "a `draft` PO (task-07 rules)"; Scope step 3 needs a manual line on it. Now its request lines must lead the edit unchanged in item and quantity (repriced in place, links kept); the lines after them are the order's own and are replaced as on any draft. The purchase-request spec vector covers reprice + own line → 200 (stored rows checked), changed quantity / dropped request line / own line first → 409, back to the request line alone → 1 line (PR + PO specs 39/39 passed).

Reachability: the e2e drives AppModule over HTTP against the compose Postgres with the seeded demo users; backend restarted afterwards: `Mapped {/api/v1/inventory/purchase-orders/:id, PATCH}`, `{…/from-requests, POST}`, `Nest application successfully started`.

Cleanup (artifacts are ephemeral): the run's rows are removed by id in `afterAll`, notifications included (order, request, quotation, estimate, purchase order and the items' low-stock notices); after the passing run no notification names a purchase order that no longer exists. 14 such purchase-order notices left by this session's earlier runs (before the cleanup fix) were deleted.

Review: code-auditor FAIL (1 High: the purchase-order notices were not cleaned; 1 Medium: a foreign open stock count would fail on a bare 409) → fixed, plus Lows 1–3 (over-receipt by quantity while partially received, the reason message, issued/returned asserted) → re-review PASS (0 Critical / 0 High / 0 Medium).

Deviations and limitations for GATE-DONE: `eng_lead` is not signed in (no step needs it) and `sales_mgr` is (it approves the quotation); `engineer_a` gets 403 on the material view (step 6), so only its availability read is money-checked; storekeeper lists are read unfiltered; the notice polling has no timeout message of its own; the PO editor lets a user change a request line and only the save answers 409; the shared database's `feature_flags` relation is missing (logged by both e2e suites, no effect on them).

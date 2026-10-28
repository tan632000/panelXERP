# Task 17 — Purchasing and warehouse chain proven end-to-end over HTTP

Status: pending

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

# Task 12 — Issue to an order/panel by scanning, and workshop returns

Status: pending

## Outcome
A storekeeper scans materials out to an open order (optionally a panel), using that order's reservation first; issuing beyond the BOM needs a reason, also when two issues race; leftovers come back from the workshop at the cost they left with and are re-reserved for that order while it is open and still short.

## Scope
- In (issue, `XK_`; permission modules `stock_issue`, `stock_return` declared here): header `stock_issues` (`code`, `order_id` without FK, `note`, `request_key` unique NULL, `created_by`, `created_at`); lines (`item_id`, `order_line_id` NULL, `quantity`, `unit_cost`, `value`, `reason` NULL). `POST /inventory/issues` (`stock_issue:create`) `{ orderId, requestKey?, note?, lines: [{ itemId, orderLineId?, quantity, reason? }] }`:
  1. `createWithDocumentCode` tx; a stored `requestKey` → the original, 200.
  2. `OrderMaterialReadPort.lockOrderForMaterial(manager, orderId)` — order row `FOR SHARE` (D-04, the first lock of this document), material visibility (404); then **immediately** insert the issue header with `request_key` (D-18), before any validation and before the balance locks: a concurrent twin (also holding the shared order lock) blocks on the `request_key` unique index until the first commits, then fails → rollback → original read back, 200 (never a 400/409 from steps 3–5). Then: status must be `open` (409; user, Q7).
  3. `orderLineId` must belong to the order (400).
  4. Lock balances (D-04). **Only now**, under the balance locks, read the order's net issued per item and check over-BOM (D-05, user): when net issued after this document exceeds demand (items not in the BOM have demand 0), every line of that item needs a non-blank `reason` (400). All comparisons in `decimal.js` (D-17).
  5. Per item take `min(q, reserved(o,i))` from the order's reservation, the rest from available; `q > reserved(o,i) + available` → 409 (another order's reservation is never taken).
  6. Post `issue` movements at current avg (D-06) with `order_id`, `order_line_id`, `reason`. After commit: low-stock and shortage alerts.
- In (workshop return, `NT_`): header `stock_workshop_returns` + lines (`item_id`, `order_line_id` NULL, `quantity`, `unit_cost`, `value`, `note`), `request_key` per D-18. `POST /inventory/workshop-returns` (`stock_return:create`): order `FOR SHARE`, then immediately the header insert with `request_key` (D-18, same rule as the issue), then order status `open` or `cancelled` (user, Q7; others 409); lock balances; **then** read net issued and check `q ≤ net issued(o,i)` (409) and compute the order's net issued average cost for the item (D-06); post `workshop_return`; then `allocate(items, preferOrderIds = [orderId])` — (user, Q2) the order is a candidate only while open and still short, otherwise the stock is free and goes by delivery date; alerts after commit.
- Reads: lists/details (`stock_issue:read`, `stock_return:read`); D-19 money keys only with `purchase_price:read`. The material view (task-09) shows issued/returned/over-BOM reasons.
- Frontend: issue screen opened from an order's material page or by typing/scanning the order code: BOM per panel with demand / reserved / issued / short, `ScanInput` adds 1 to the selected panel's line of the scanned item (or an "outside BOM" line), reason field required and highlighted when over-BOM; workshop return screen for an order listing net issued per item. Both post once with a `requestKey`.
- Out: issue to production orders (P3), returns to supplier (13).

## Worked example (item X; on hand 10, value 1 000 000; O1 (2026-11-05) demand 6 reserved 6; O2 (2026-11-10) demand 6 reserved 4)
1. Issue O1 X 4 → −400 000; O1 reserved 2; on hand 6, value 600 000.
2. Issue O1 X 3 with a reason → 409 (O1 reserved 2 + available 0 < 3; O2's 4 untouched). Issue O1 X 2 → −200 000; O1 reserved 0, issued 6; on hand 4, value 400 000.
3. Receipt X 3 @ 130 000 (task-11 path) → value 790 000, on hand 7, avg 112 857.1429; O2 +2 (short 0); available 1.
4. Issue O1 X 1 without reason → 400; with reason → −112 857; on hand 6, value 677 143; O1 issued 7.
5. Workshop return O1 X 2 → unit cost (400 000 + 200 000 + 112 857)/7 = 101 836.7143, value +203 673; on hand 8, value 880 816, avg 110 102.0000; O1 net issued 5 → short 1 → O1 +1 first (Q2); available 1.
6. Workshop return O1 X 6 → 409 (net issued 5). Issue to a cancelled order → 409. Cancel O1, then workshop return O1 X 1 → accepted; O1 is not a candidate, so the unit is allocated by delivery date (O2 is not short) and stays free.

## Coverage
- CP-12

## Ownership
- Create: `backend/src/plugins/inventory/issue/` (issue + workshop-return services, entities, migration, permissions, controller, specs), `frontend/src/plugins/inventory/issue/`, `frontend/src/app/[locale]/inventory/issues/`
- Modify: `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts` (+ spec, `lockOrderForMaterial`), `backend/src/plugins/inventory/material/` (issued/returned/reasons in the view), `inventory.features.ts`, shared registration files (incl. `soft-delete-unique-index.spec.ts`)
- Read: `backend/src/plugins/inventory/stock/services/stock-posting.service.ts`

## Steps
1. Entities/migration; issue service; workshop return service.
2. Specs: worked example exact; panel line of another order → 400; `expectNoMoneyKeys` on the storekeeper's issue and return responses.
3. Real-Postgres races: (a) two issues to O1 and O2 of X concurrently with on hand = Σ reservations → both succeed within their reservations, available stays ≥ 0; (b) issue to O1 concurrent with O1 cancel → never an issue movement on a cancelled order; (c) two workshop returns of 3 with net issued 5 → one 409; (d) O1 demand 6, issued 4: two concurrent issues of 2 without reason → exactly one succeeds, the other returns 400 asking for a reason; (e) boundary fixture — O1 demand 6, net issued 4, reserved 2: two posts of X 2 without reason and with the same `requestKey` via `Promise.all` → one 201 and one 200 with the same id, one set of movements, net issued exactly 6 (validating before the header insert would make the twin's net issued 8 > 6 and return 400, failing the probe); likewise two workshop returns with one `requestKey` whose quantity equals the net issued → same id.
4. Frontend issue + return screens + tests (over-BOM reason required; scan of an unknown code keeps focus).
5. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (issues, workshop returns), AC-08 (issue/return cost), AC-17, AC-18, AC-26.

## Dependencies
- task-11-receipt-from-po.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/issue/services/issue.service.spec.ts && test -f src/plugins/inventory/issue/services/workshop-return.service.spec.ts && test -f src/plugins/inventory/issue/services/issue-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/issue/tests/issue-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts`
- Named probe: `src/plugins/inventory/issue/services/issue.service.spec.ts`, `src/plugins/inventory/issue/services/workshop-return.service.spec.ts`, `src/plugins/inventory/issue/services/issue-race.spec.ts` (races a–e), frontend `src/plugins/inventory/issue/tests/issue-screen.test.tsx`, `src/kernel/langs/tests/permission-labels.test.ts`
- Reachability: compose Postgres; permission-labels run proven in task-02.
- Oracle: worked-example numbers exact; races as stated; real-DB specs 0 skipped.
- Counterexample: taking stock from total available without the per-order split must let step 2's issue of 3 succeed; skipping the order `FOR SHARE` must let race (b) post to a cancelled order; reading net issued before the balance lock must let both issues of race (d) through.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

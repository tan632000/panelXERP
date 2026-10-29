# Task 12 — Issue to an order/panel by scanning, and workshop returns

Status: done

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

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/issue/services/issue.service.spec.ts && test -f src/plugins/inventory/issue/services/workshop-return.service.spec.ts && test -f src/plugins/inventory/issue/services/issue-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/issue/tests/issue-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
Exit: 0
Base: 1b4fe8964fc3de7e316808b7f237540f0f4841ae
Head: 05bb02ae5164a9c6c0f410d6582b63faf4bbf1f45a46803fa91423e942906f06
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/issue/services/issue.service.spec.ts && test -f src/plugins/inventory/issue/services/workshop-return.service.spec.ts && test -f src/plugins/inventory/issue/services/issue-race.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npm run seed && npx jest --ci src/plugins/inventory src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts && npm run validate:migrations" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/issue/tests/issue-screen.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory" && MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$(pwd -W)/backend:/backend:ro" frontend npx vitest run src/kernel/langs/tests/permission-labels.test.ts
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
> panelxerp-backend@0.0.1 seed
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts (20.214 s)
PASS src/plugins/inventory/receipt/services/receipt-race.spec.ts (20.969 s)
PASS src/plugins/inventory/issue/services/workshop-return.service.spec.ts (23.051 s)
PASS src/plugins/inventory/issue/services/issue-race.spec.ts (23.331 s)
PASS src/plugins/inventory/material/material.controller.spec.ts (6.2 s)
PASS src/plugins/sales/_shared/ports/request-status.port.spec.ts
PASS src/plugins/inventory/issue/services/issue.service.spec.ts (6.76 s)
PASS src/plugins/inventory/receipt/services/receipt.service.spec.ts (29.318 s)
PASS src/plugins/inventory/purchase-order/services/purchase-order-approval.service.spec.ts (9.268 s)
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts (5.956 s)
PASS src/plugins/inventory/supplier/supplier.controller.spec.ts (6.131 s)
PASS src/plugins/sales/_shared/ports/order-material-read.port.spec.ts
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts (12.59 s)
PASS src/plugins/inventory/stock/stock.controller.spec.ts (6.603 s)
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/material/services/reservation-race.spec.ts
PASS src/plugins/inventory/material/services/shortage-alert.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/plugins/inventory/material/services/reservation.service.spec.ts
PASS src/plugins/inventory/supplier/services/supplier.service.spec.ts
PASS src/plugins/sales/_shared/utils/sales-document-code.util.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/sales/_shared/ports/order-lifecycle-registry.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts (6.198 s)
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/plugins/inventory/material/services/material.service.spec.ts
PASS src/plugins/inventory/_shared/gateways/supplier-reference-check-registry.spec.ts
PASS src/plugins/sales/_shared/ports/request-close-registry.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/inventory/purchase-order/utils/purchase-order-pricing.spec.ts
Test Suites: 32 passed, 32 total
Tests:       311 passed, 311 total
> panelxerp-backend@0.0.1 validate:migrations
Migration filename check passed (35 files).
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests) 4503ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/receipt/tests/receive-screen.test.tsx (5 tests) 957ms
 ✓ src/plugins/inventory/material/tests/order-material.test.tsx (4 tests) 1315ms
 ✓ src/plugins/inventory/issue/tests/issue-screen.test.tsx (6 tests) 3373ms
 ✓ src/plugins/inventory/supplier/tests/supplier-list.test.tsx (4 tests) 2268ms
 ✓ src/plugins/inventory/material/tests/shortage-notification.test.ts (4 tests) 109ms
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests) 85ms
 ✓ src/plugins/inventory/purchase-order/tests/purchase-order-detail.test.tsx (12 tests) 1031ms
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests) 677ms
 Test Files  8 passed (8)
      Tests  45 passed (45)
 ✓ src/kernel/langs/tests/permission-labels.test.ts (6 tests) 7623ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
EXIT=0
```

Negative proof (each counterexample applied alone, issue specs rerun, files restored byte-for-byte):
- stock taken from the item's total without the per-order split → worked example step 2 fails (the issue of 3 succeeds).
- order read without its `FOR SHARE` lock → race (b) fails (an issue movement on the cancelled order).
- net issued read before the balance lock → race (d) fails (both issues pass); for the return, race (c) fails likewise.

Reachability: backend restarted; `StockIssueModule dependencies initialized`, `Mapped {/api/v1/inventory/issues, GET}`, `{/api/v1/inventory/issues/:id, GET}`, `{/api/v1/inventory/issues, POST}`, `{/api/v1/inventory/workshop-returns, GET}`, `{/api/v1/inventory/workshop-returns/:id, GET}`, `{/api/v1/inventory/workshop-returns, POST}`, `Nest application successfully started`. Frontend routes `/inventory/issues`, `/inventory/issues/new`, `/inventory/issues/return`, sidebar item `issues`, and the issue / workshop return actions on the order material page.

Review: code-auditor FAIL (1 High: lists not scoped per D-09; 3 Medium) → fixed → re-review PASS (0 Critical / 0 High / 0 Medium); Lows recorded for GATE-DONE.

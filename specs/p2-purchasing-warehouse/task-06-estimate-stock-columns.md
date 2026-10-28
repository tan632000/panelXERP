# Task 06 — Stock availability in the estimate BOM grid

Status: done

## Outcome
While building or reading an estimate, engineers and sales see for each BOM line the item's on hand, available and short quantity (D-16), read-only and without any money.

## Scope
- In: `GET /inventory/stock/availability?itemIds=1,2` (`stock:availability`, 1–500 ids, else 400): per item `onHand`, `reserved`, `available`; items without a balance row return zeros; deleted or unknown ids are omitted. No money key (D-19), whoever asks.
- Frontend: hook `useStockAvailability(itemIds)` in `frontend/src/plugins/inventory/stock/hooks/`; `EstimateBomGrid.tsx` (`frontend/src/plugins/sales/estimate/components/EstimateBomGrid.tsx`) gains read-only columns on hand / available / short, where short = max(0, Σ (BOM qty × panel qty) of that item across the revision − available), computed with `decimal.js` (D-17). Columns render only for holders of `stock:availability`; loading shows a placeholder, an error shows "—" without blocking editing.
- Out: reservations at estimate time; the stock list itself (05).

## Coverage
- CP-06

## Ownership
- Create: `frontend/src/plugins/inventory/stock/hooks/useStockAvailability.ts`, `frontend/src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx`, `backend/src/plugins/inventory/stock/services/stock-availability.service.ts` (+ spec)
- Modify: `backend/src/plugins/inventory/stock/stock.controller.ts`, `frontend/src/plugins/sales/estimate/components/EstimateBomGrid.tsx`, shared registration files
- Read: `backend/src/plugins/sales/estimate/services/estimate-totals.ts:7-9`

## Steps
1. Availability service + endpoint; spec: zeros for an item without balance; 501 ids → 400; `engineer` → 200 and `expectNoMoneyKeys`; `engineer` on `/inventory/stock` → 403 (task-05 permission).
2. Hook + grid columns; test: an item required 4 per panel × 2 panels with available 5 shows short 3; a 0.1 × 3 panels requirement against available 0.3 shows short 0; columns hidden without `stock:availability`.
3. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (availability), AC-22.

## Dependencies
- task-05-stock-ledger-balances.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-availability.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory/stock src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/plugins/sales/estimate"`
- Named probe: `src/plugins/inventory/stock/services/stock-availability.service.spec.ts`, frontend `src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx`
- Reachability: known after task-05.
- Oracle: exit 0; short 3 and short 0 as stated; real-DB specs 0 skipped.
- Counterexample: computing short per BOM line instead of per item across the revision must show 0 instead of 3 (fixture: two panels of quantity 1, each with a line of 4) and fail.
- Artifacts: ephemeral.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

Verification: PASS
Command: docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-availability.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory/stock src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/plugins/sales/estimate"
Exit: 0
Base: 6b156c3c1030e283d443dc5c77a74d441fc60b85
Head: f919a9a4d315fb9ffcf2f0fd60fa3bd3ff16eeb698d8eae3d719f7b3eb1ab850
```text
$ docker compose exec -T backend sh -c "test -f src/plugins/inventory/stock/services/stock-availability.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory/stock src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "test -f src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/stock src/plugins/sales/estimate"
> panelxerp-backend@0.0.1 lint
> panelxerp-backend@0.0.1 typecheck
> panelxerp-backend@0.0.1 migration:run
> panelxerp-backend@0.0.1 typeorm
No migrations are pending
PASS src/kernel/core/database/soft-delete-unique-index.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.inventory.spec.ts
PASS src/kernel/core/database/seeds/seed-roles.panel.spec.ts
PASS src/plugins/inventory/stock/services/stock-alert.service.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting.service.spec.ts
PASS src/kernel/core/database/seeds/seed-users.spec.ts
PASS src/kernel/core/database/seeds/helpers/seed-scope.spec.ts
PASS src/kernel/core/database/seeds/permission-scope-conversion.spec.ts
PASS src/plugins/inventory/stock/utils/stock-cost.util.spec.ts
PASS src/plugins/inventory/stock/services/stock-posting-race.spec.ts
PASS src/plugins/inventory/stock/stock.controller.spec.ts
PASS src/plugins/inventory/stock/services/stock-availability.service.spec.ts
Test Suites: 12 passed, 12 total
Tests:       117 passed, 117 total
> panelxerp-frontend@0.1.0 lint
> panelxerp-frontend@0.1.0 lint:i18n
 ✓ src/kernel/core/tests/i18n-enum-conformance.test.ts (7 tests)
 Test Files  1 passed (1)
      Tests  7 passed (7)
> panelxerp-frontend@0.1.0 typecheck
 ✓ src/plugins/inventory/stock/tests/stock-notification.test.ts (4 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-totals.test.ts (4 tests)
 ✓ src/plugins/sales/estimate/tests/request-estimate-section.test.tsx (6 tests)
 ✓ src/plugins/inventory/stock/tests/stock-list.test.tsx (6 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-stock-columns.test.tsx (5 tests)
 ✓ src/plugins/sales/estimate/tests/estimate-editor.test.tsx (18 tests)
 Test Files  6 passed (6)
      Tests  43 passed (43)
```
Counterexample (controller run, reverted): computing short per BOM line instead of per item across the revision made `counts an item across every panel of the revision, not per line` fail with `expected '0' to be '3'`; the revision-wide sum passes. Reachability: after a backend restart, live `GET /api/v1/inventory/stock/availability` answered engineer_a and sales_a 200 (both 403 on `/inventory/stock`), 501 ids 400. Review: code-auditor PASS (0 Critical/High/Medium, 5 Low; the `itemIds` OpenAPI type was fixed before this run). Scope note: `EstimateEditor.tsx` gained one prop (`revisionPanels`) so the grid can sum the whole revision, and `stock.controller.spec.ts` gained the new provider.

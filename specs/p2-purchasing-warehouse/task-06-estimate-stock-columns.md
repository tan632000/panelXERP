# Task 06 — Stock availability in the estimate BOM grid

Status: pending

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

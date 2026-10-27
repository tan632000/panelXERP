# Task 16 — Estimate versus actual material per order

Status: pending

## Outcome
For any order they may see, users compare per item the estimated quantity (and, with `purchase_price:read`, cost) against what was actually issued net of workshop returns, with every over-BOM issue and its reason.

## Scope
- In: `GET /inventory/materials/orders/:orderId/estimate-vs-actual` (`material:read`, visibility D-09). Per item: code, name, unit; estimated qty = order demand (D-05); actual qty = net issued; qty variance; estimated cost = Σ over the order's estimate revision BOM lines of that item of `amount × panel quantity` (new method of `OrderMaterialReadPort`, `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts`); actual cost = Σ issue values − Σ workshop-return values from `stock_movements` (absolute values); cost variance; totals. Over-BOM list: issue code, date, item, quantity, reason, panel tag. Items issued but not in the BOM appear with estimated 0. Unlinked BOM lines (D-02) listed with a warning. Quantities in `decimal.js` (D-17).
- AC-02: cost keys (`estimatedCost`, `actualCost`, `costVariance`, totals) present only with `purchase_price:read`; never any sales price, total or margin (task-09 whitelist + D-19 helper).
- Frontend: "Dự toán – Thực tế" tab on the order material page; cost columns hidden without `purchase_price:read`.
- Out: P6 profit/loss, labour and other cost lines, Excel export.

## Worked example (order O1 exactly as it stands after task-12 worked-example step 5, before the step-6 cancel and extra return; plus one extra issue of Z; estimate: X 3 per panel × 2 panels, unit cost 95 000 → amount 285 000 per panel)
- X: estimated 6 / 570 000; actual 5 / (400 000 + 200 000 + 112 857 − 203 673) = 509 184; variance −1 / −60 816.
- Z (not in BOM) issued 1 at 20 000 with reason "thay thế" → estimated 0 / 0, actual 1 / 20 000, listed under over-BOM.
- Storekeeper and sales owner see quantities and the over-BOM list but no cost key; director and purchasing see costs.

## Coverage
- CP-16

## Ownership
- Create: `backend/src/plugins/inventory/material/services/estimate-vs-actual.service.ts` (+ spec), `frontend/src/plugins/inventory/material/components/EstimateVsActualTab.tsx`, `frontend/src/plugins/inventory/material/tests/estimate-vs-actual.test.tsx`
- Modify: `backend/src/plugins/sales/_shared/ports/order-material-read.port.ts` (+ spec), `backend/src/plugins/inventory/material/material.controller.ts`, shared registration files
- Read: `backend/src/plugins/sales/estimate/services/estimate-totals.ts`

## Steps
1. Port method returning estimated cost per item (no prices of the quotation or order).
2. Service + spec reproducing the worked example; `expectNoMoneyKeys` for storekeeper and sales; `sales_b` on `sales_a`'s order → 404.
3. Frontend tab + test.
4. Regenerate OpenAPI + `api.ts`.

## Acceptance
- AC-02 (report), AC-23.

## Dependencies
- task-15-purchase-requests.md

## Verification Plan
- Command: `docker compose exec -T backend sh -c "test -f src/plugins/inventory/material/services/estimate-vs-actual.service.spec.ts && npm run lint && npm run typecheck && npm run migration:run && npx jest --ci src/plugins/inventory/material src/plugins/sales/_shared src/kernel/core/database/seeds src/kernel/core/database/soft-delete-unique-index.spec.ts" && docker compose exec -T frontend sh -c "test -f src/plugins/inventory/material/tests/estimate-vs-actual.test.tsx && npm run lint && npm run typecheck && npx vitest run src/plugins/inventory/material"`
- Named probe: `src/plugins/inventory/material/services/estimate-vs-actual.service.spec.ts`, frontend `src/plugins/inventory/material/tests/estimate-vs-actual.test.tsx`
- Reachability: compose Postgres for the fixture order.
- Oracle: worked-example figures exact; real-DB specs 0 skipped.
- Counterexample: actual cost from gross issues (ignoring returns) gives 712 857; estimated cost without the panel quantity gives 285 000; both must fail.
- Artifacts: ephemeral; fixtures removed by unique prefix.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

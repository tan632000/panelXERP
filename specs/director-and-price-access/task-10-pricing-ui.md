# Task 10 — Pricing UI

Status: pending

## Outcome
On a submitted, unpriced revision an `estimate:price` holder edits BOM unit costs (prefilled with the reference price), manages cost lines and completes the pricing; every reader sees whether the estimate awaits pricing; a quotation attempt on an unpriced estimate shows a clear message.

## Scope
- In:
  - `types.ts`, `services/estimate.service.ts`, `hooks/api/useEstimate.ts`: `pricedAt`/`pricedBy` on revisions; calls for `PATCH :id/bom-lines/:lineId/unit-cost`, the cost-line routes and `POST :id/price` (task-07); draft BOM calls stop sending `unitCost` (`types.ts:110`).
  - `EstimateDetailPage.tsx:119-136`: pricing mode = `can(EstimatePermission.price)` && revision `submitted` && latest && `pricedAt == null` && request `estimated`; a status chip "Chờ điền giá" / "Đã điền giá"; a "Hoàn tất giá" action with confirm; the 400 naming zero-cost items is shown.
  - Pricing mode reaches the inputs (R-07): `EstimateEditor.tsx:31-36` passes a single `editable` prop to the grid and cost lines, so add a separate `pricing` prop; `useEstimateEditor.ts:55-59` commits every BOM field through `edits.updateBomLine` (the draft `PATCH /bom-lines/:id`, a 400 for `unitCost` after task-07), so in pricing mode a `unitCost` commit calls a new `setUnitCost` mutation and cost-line commits call the pricing cost-line mutations; `constants.ts:39-51` `estimateApiRoutes` gains `unitCost(id, lineId)` and `price(id)`.
  - `EstimateBomGrid.tsx`, `EstimateCostLines.tsx`: in pricing mode the unit cost input and the cost-line editor (moved from the draft) are live; elsewhere read-only.
  - `RequestEstimateSection.tsx`: the pricing status beside the revision, from the list item's `latestPricedAt` (task-07; the section reads `findAll`, `useEstimate.ts:51-58`).
  - `map-quotation-api-errors.ts:24`: the `noEstimate` matcher also matches `no priced estimate`; its vi/en text says the estimate is not priced yet.
  - `estimate.json` vi/en: labels for the chip, action, confirm and zero-cost error.
- Out: re-opening a priced revision.

## Coverage
- CP-09

## Ownership
- Modify: `frontend/src/plugins/sales/estimate/types.ts`, `constants.ts`, `services/estimate.service.ts`, `hooks/api/useEstimate.ts`, `hooks/useEstimateEditor.ts`, `components/EstimateEditor.tsx`, `components/EstimateDetailPage.tsx`, `components/EstimateBomGrid.tsx`, `components/EstimateCostLines.tsx`, `components/RequestEstimateSection.tsx`, `frontend/src/plugins/sales/quotation/utils/map-quotation-api-errors.ts`, `frontend/src/kernel/langs/{vi,en}/estimate.json`, quotation vi/en message files holding `noEstimate`
- Create: `frontend/src/plugins/sales/estimate/tests/estimate-pricing.test.tsx`, `frontend/src/plugins/sales/quotation/tests/map-quotation-api-errors.test.ts`

## Steps
1. Test: sales user, revision submitted and unpriced → unit cost inputs and the complete action; typing a cost and leaving the field sends `PATCH …/unit-cost` with the number; complete sends `POST …/price`; a 400 shows the item codes.
2. Test: the same revision priced, or an engineer, or a draft → no inputs, chip shown.
3. `map-quotation-api-errors.test.ts` (R-14 d; no mapper test exists today): `The request has no priced estimate to quote.` resolves to `noEstimate`, and so does the old `no submitted estimate` text.
4. Implement; then the live walk below.

## Acceptance
- AC-14.

## Dependencies
- task-07-pricing-step-backend.md
- task-09-estimate-ui-no-prices.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate src/plugins/sales/quotation"`
- Named probe: `estimate-pricing.test.tsx` (pricing mode, `setUnitCost` call rather than `updateBomLine`, read-only cases, error), `map-quotation-api-errors.test.ts`.
- Reachability: known for source. Live: the dev DB already holds the new grants (re-seeded in task-07, R-08). After restarting the frontend and backend containers (Docker watch does not reload on this host), `engineer_a` submits an estimate without prices, `sales_a` prices and completes it, then creates the quotation; the data is kept.
- Oracle: exit 0; in the live walk the engineer never sees a price and the quotation is refused before completion and created after.
- Counterexample: showing inputs on a priced revision must fail Step 2; committing a pricing-mode unit cost through `updateBomLine` must fail Step 1; a mapper matching only `no submitted estimate` must fail Step 3; sending `unitCost` on a draft BOM call must make the backend answer 400 in the live walk.
- Artifacts: live demo data kept.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt

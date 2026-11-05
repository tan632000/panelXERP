# Task 09 — Estimate UI without prices for engineering

Status: pending

## Outcome
A user without `reference_price:read` sees no unit cost, amount, total or cost line anywhere in the estimate screens, and draft BOM rows have no unit cost input for anyone; the director sees the estimate write controls.

## Scope
- In:
  - `types.ts:26,39-40,49,58-62,70,80`: money fields become optional (absent for engineering, task-06), so no screen renders `undefined` as 0.
  - Gate money on `can("reference_price:read")` (`ItemPermission.referencePriceRead`, as `ItemTable.tsx:60`): `EstimateTable.tsx:82-86` (total column), `RequestEstimateSection.tsx:83-85`, `EstimateDetailPage.tsx:203-205`, `EstimateEditor.tsx:135-152,215-247` (panel unit cost/total, summary), `EstimateBomGrid.tsx:163-164,249-256` (unit cost and amount columns), `EstimateCostLines.tsx` (section hidden).
  - Draft rows: the unit cost input of `EstimateBomGrid.tsx:189-246` goes for every user (draft DTOs no longer take it, task-07); a draft's unit cost is read-only and shown only to price readers.
  - Totals without money (R-06): `EstimateEditor.tsx:61-66` runs `panelFigures(entry, drafts)` for every panel and it calls `panel.costLines.map` (`estimate-drafts.ts:26-32`, `estimate-totals.ts:52-61`), so an engineer response without `costLines` throws a TypeError and blanks the page. Skip the totals computation when the user cannot read prices, and treat an absent `costLines` as `[]` in `estimate-drafts.ts`/`estimate-totals.ts` so the optional types typecheck.
  - `estimate-writer.ts:1-18`: `director` is a writer beside `engineeringLead`; its comment updated.
  - Existing tests that encode the old behavior: `estimate-editor.test.tsx:388-399` ("shows a draft read-only to a director holding every estimate permission") → the director gets edit controls; fixtures with `unitCost` (`:72,89,110-121,255`) keep working for price readers; `estimate-stock-columns.test.tsx:47,62` unchanged in meaning. `estimate-editor.test.tsx` uses an ENGINEER actor by default (`:219-230`) while asserting price test ids (`revision-total`, `panel-total`, `bom-amount-*`) in the totals, live-totals and cost-line cases (`:236-292`, `:430`); after this task those ids no longer render for an engineer, so those cases move to an actor that reads prices (the director with `reference_price:read`). This is the new behavior, not a weakened test (R-09): each moved case keeps its assertions, and the engineer gets a new negative case.
- Out: pricing inputs on a submitted revision (task-10).

## Coverage
- CP-08

## Ownership
- Modify: `frontend/src/plugins/sales/estimate/utils/estimate-drafts.ts`, `frontend/src/plugins/sales/estimate/utils/estimate-totals.ts`, `frontend/src/plugins/sales/estimate/types.ts`, `components/EstimateTable.tsx`, `components/RequestEstimateSection.tsx`, `components/EstimateDetailPage.tsx`, `components/EstimateEditor.tsx`, `components/EstimateBomGrid.tsx`, `components/EstimateCostLines.tsx`, `utils/estimate-writer.ts`
- Modify (tests): `tests/estimate-editor.test.tsx`, `tests/request-estimate-section.test.tsx`

## Steps
1. Tests with an engineer user (permissions without `reference_price:read`) and a response without money keys: list, request section, detail and editor render no `₫`/amount cell, no cost-line section, no `NaN`/`0`; with a sales user and money keys the figures render.
2. Director: edit controls on a draft; admin: still read-only.
3. Implement.

## Acceptance
- AC-13.

## Dependencies
- task-06-engineering-no-money.md

## Verification Plan
- Command: `docker compose exec -T frontend sh -c "npm run lint && npm run typecheck && npx vitest run src/plugins/sales/estimate"`
- Named probe: `estimate-editor.test.tsx` (engineer without prices, director writer), `request-estimate-section.test.tsx` (total hidden).
- Reachability: known.
- Oracle: exit 0; engineer renders contain no money text or column header; sales renders keep them.
- Counterexample: a render that still calls `panel.costLines.map` must throw in the engineer case; gating on `estimate:update` instead of `reference_price:read` must fail the engineering-lead case; rendering `total ?? 0` must fail the "no 0" assertion.
- Artifacts: none.

## Failure Protocol
On a failed Step or Verification Plan run: stop; do not widen scope, change the Command, or weaken a test; record observed versus expected; repair only the cited cause; after three failed rounds, stop and ask the user.

## Receipt
